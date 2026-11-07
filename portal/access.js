// Box portal beta-access client — Foundation identity API, contract REV1.
// Stateless routes only: no cookies, no CSRF, no account sessions; credentials stay omitted.
const GITHUB_START = "/api/beta-identity/github/start"
const GITHUB_STATUS = "/api/beta-identity/github/status"
const GOOGLE_CONFIG = "/api/beta-identity/google"
const GOOGLE_VERIFY = "/api/beta-identity/google/verify"
const GSI_SRC = "https://accounts.google.com/gsi/client"

class IdentityError extends Error {}

// The API base must be an absolute https origin from the page meta; never inferred.
export function validApiOrigin(configured) {
  if (typeof configured !== "string" || !configured) return ""
  let url
  try { url = new URL(configured) } catch { return "" }
  if (url.origin !== configured || url.protocol !== "https:") return ""
  return url.origin
}

export function githubOutcome(data) {
  const unexpected = { stage: "Check incomplete", message: "The beta access service returned an unexpected response. Access has not been confirmed.", done: true }
  if (!data || data.provider !== "github") return unexpected
  if (data.status === "pending") return { stage: "Checking", message: "Waiting for GitHub sign-in and the beta access check.", done: false }
  if (data.status === "expired") return { stage: "Sign-in expired", message: "The GitHub sign-in expired. Start again to check beta access.", done: true }
  if (data.status === "verified" && data.membership === "listed" && Number.isSafeInteger(data.id) && data.id > 0) {
    return { stage: "Access confirmed", message: `Beta access confirmed for GitHub account ${data.id}.`, done: true }
  }
  if (data.status === "verified" && data.membership === "not-listed") {
    return { stage: "Access not confirmed", message: "This GitHub account is not on the beta list.", done: true }
  }
  if (data.status === "verified" && data.membership === "unconfirmed") {
    return { stage: "Check incomplete", message: `Beta access could not be confirmed against the current list snapshot${data.reason ? ` (${data.reason})` : ""}. Try again later.`, done: true }
  }
  return unexpected
}

export function googleOutcome(data) {
  const unexpected = { stage: "Check incomplete", message: "The beta access service returned an unexpected response. Access has not been confirmed.", done: true }
  if (!data || data.provider !== "google") return unexpected
  if (data.status === "admitted" && data.hostedDomain === "mclelland.ca") {
    return { stage: "Access confirmed", message: "Beta access confirmed for an approved Google domain account.", done: true }
  }
  if (data.status === "denied") {
    const reason = data.reason === "wrong-hosted-domain" ? " This Google account is outside the approved domain." : ""
    return { stage: "Access not confirmed", message: `Google sign-in was not accepted for beta access.${reason}`, done: true }
  }
  return unexpected
}

export function serviceFailure(httpStatus, data) {
  if (httpStatus === 503 || data?.status === "unconfigured") return "Beta access is not configured on the identity service yet. No account has been connected."
  if (httpStatus === 502 || data?.status === "error") return "The identity provider could not be reached. Access has not been confirmed."
  return "The beta access service returned an error. Access has not been confirmed."
}

export function loadGsi(document) {
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${GSI_SRC}"]`)
    const done = () => {
      const google = globalThis.google
      if (google?.accounts?.id) { script.dataset.loaded = "true"; resolve(google) }
      else reject(new IdentityError("Google sign-in could not be loaded in this browser."))
    }
    if (script) {
      if (script.dataset.loaded === "true" && globalThis.google?.accounts?.id) return resolve(globalThis.google)
      script.addEventListener("load", done)
      script.addEventListener("error", () => reject(new IdentityError("Google sign-in could not be loaded in this browser.")))
      return
    }
    script = document.createElement("script")
    script.src = GSI_SRC
    script.async = true
    script.addEventListener("load", done)
    script.addEventListener("error", () => reject(new IdentityError("Google sign-in could not be loaded in this browser.")))
    document.head.appendChild(script)
  })
}

export function createBetaAccessClient({ document, location, fetch: fetchImpl, schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout, gsiLoader = loadGsi, now = Date.now }) {
  const byId = (id) => document.getElementById(id)
  const github = byId("github-start")
  const google = byId("google-start")
  const status = byId("beta-access-status")
  const stage = byId("beta-access-state")
  const check = byId("beta-access-check")
  const device = byId("beta-access-device")
  const code = byId("beta-access-code")
  const link = byId("beta-access-link")

  let apiOrigin = validApiOrigin(document.querySelector('meta[name="citadel-beta-api-origin"]')?.content)
  if (!apiOrigin) {
    status.hidden = false
    status.textContent = "The beta access connection is not configured. No account has been connected."
    stage.textContent = "Connection needed"
    return { ready: false, stop() {} }
  }
  let generation = 0
  let busy = false
  let poll
  let pollDeadline = 0
  let deviceCode = ""
  let googleConfig = null

  function clearDevice() {
    device.hidden = true
    code.textContent = ""
    link.removeAttribute("href")
  }

  function controls(locked) {
    github.disabled = locked
    google.disabled = locked
    check.disabled = locked
  }

  function failed(message) {
    clearDevice()
    status.hidden = false
    stage.textContent = "Check incomplete"
    status.textContent = message
    check.hidden = true
  }

  function finish(outcome) {
    clearDevice()
    status.hidden = false
    stage.textContent = outcome.stage
    status.textContent = outcome.message
    check.hidden = true
  }

  async function request(path, options = {}) {
    const hasBody = options.body !== undefined
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetchImpl(apiOrigin + path, {
        method: options.method || (hasBody ? "POST" : "GET"),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: hasBody ? { "Content-Type": "application/json" } : {},
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      })
      const type = response.headers.get("content-type") || ""
      if (!type.includes("application/json")) throw new IdentityError("The beta access service did not return a valid response. Access has not been confirmed.")
      return { ok: response.ok, httpStatus: response.status, data: await response.json() }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function statusTick(current) {
    const r = await request(GITHUB_STATUS, { body: { deviceCode } })
    if (current !== generation) return
    if (!r.ok) { failed(serviceFailure(r.httpStatus, r.data)); return }
    const outcome = githubOutcome(r.data)
    if (outcome.done) { finish(outcome); return }
    if (now() >= pollDeadline) {
      status.hidden = false
      status.textContent = "The access check is still pending. Use Check sign-in status to continue."
      check.hidden = false
      return
    }
    poll = schedule(() => statusTick(current), (r.data.intervalSeconds || 5) * 1000)
  }

  async function startGithub() {
    if (busy) return
    const current = ++generation
    cancel(poll)
    busy = true
    controls(true)
    clearDevice()
    stage.textContent = "Checking"
    status.hidden = false
    status.textContent = "Starting GitHub sign-in…"
    try {
      const r = await request(GITHUB_START, { method: "POST" })
      if (current !== generation) return
      if (!r.ok || r.data.status !== "pending" || typeof r.data.userCode !== "string" || typeof r.data.verificationUri !== "string" || typeof r.data.deviceCode !== "string") {
        failed(serviceFailure(r.httpStatus, r.data))
        return
      }
      let uri
      try { uri = new URL(r.data.verificationUri) } catch { uri = null }
      if (!uri || uri.protocol !== "https:") { failed("GitHub sign-in returned an address this page cannot use. Access has not been confirmed."); return }
      deviceCode = r.data.deviceCode
      pollDeadline = now() + (r.data.expiresInSeconds || 300) * 1000
      device.hidden = false
      code.textContent = r.data.userCode
      link.href = uri.href
      status.textContent = "Waiting for GitHub sign-in and the beta access check."
      poll = schedule(() => statusTick(current), (r.data.intervalSeconds || 5) * 1000)
    } catch (error) {
      if (current === generation) failed(error?.name === "AbortError" ? "The sign-in request timed out. Start again to check beta access." : serviceFailure(0, null))
    } finally {
      if (current === generation) { busy = false; controls(false) }
    }
  }

  async function startGoogle() {
    if (busy) return
    const current = ++generation
    cancel(poll)
    busy = true
    controls(true)
    clearDevice()
    stage.textContent = "Checking"
    status.hidden = false
    status.textContent = "Continuing with Google…"
    try {
      if (!googleConfig) {
        const r = await request(GOOGLE_CONFIG)
        if (current !== generation) return
        if (!r.ok || r.data.status !== "configured" || typeof r.data.clientId !== "string" || !r.data.clientId) { failed(r.ok ? "Google sign-in is not configured on the identity service yet." : serviceFailure(r.httpStatus, r.data)); return }
        googleConfig = r.data
      }
      const gsi = await gsiLoader(document)
      if (current !== generation) return
      const idToken = await new Promise((resolve, reject) => {
        gsi.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: (credential) => (credential?.credential ? resolve(credential.credential) : reject(new IdentityError("Google sign-in did not return a credential."))),
        })
        gsi.accounts.id.prompt((moment) => {
          if (moment?.isDismissedMoment?.() || moment?.isSkippedMoment?.()) reject(new IdentityError("Google sign-in was not completed. Use Continue with Google to try again."))
        })
      })
      if (current !== generation) return
      const r = await request(GOOGLE_VERIFY, { body: { idToken } })
      if (current !== generation) return
      if (!r.ok && r.httpStatus !== 400) { failed(serviceFailure(r.httpStatus, r.data)); return }
      finish(googleOutcome(r.data))
    } catch (error) {
      if (current === generation) failed(error instanceof IdentityError ? error.message : error?.name === "AbortError" ? "The sign-in request timed out. Start again to check beta access." : "The beta access service could not be reached. Access has not been confirmed.")
    } finally {
      if (current === generation) { busy = false; controls(false) }
    }
  }

  github.addEventListener("click", startGithub)
  google.addEventListener("click", startGoogle)
  check.addEventListener("click", () => { if (deviceCode) { pollDeadline = now() + 120000; statusTick(generation) } })
  controls(false)
  return { ready: true, startGithub, startGoogle, stop() { generation += 1; cancel(poll) } }
}

if (typeof document !== "undefined" && document.getElementById("beta-access-status")) {
  const client = createBetaAccessClient({ document, location, fetch: globalThis.fetch.bind(globalThis) })
  if (client.ready) addEventListener("pagehide", () => client.stop(), { once: true })
}
