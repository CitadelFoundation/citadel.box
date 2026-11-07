const PREFIX = "/api/box/private-installer"
class AccessCheckError extends Error {}
const STATES = new Set(["anonymous", "pending", "eligible", "refused", "expired"])

// The configured Box service owns provider verification and admission; no list is held here.
export function validAccessSession(data, now = Date.now()) {
  if (!data || !STATES.has(data.status) || !/^[0-9a-f]{64}$/.test(data.csrf || "") || "offer" in data) return false
  if (data.device && (data.status !== "pending" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.device.userCode || "") || data.device.verificationUri !== "https://github.com/login/device")) return false
  if (data.status !== "eligible") return true
  if (!Number.isSafeInteger(data.authenticatedAtSeconds) || data.authenticatedAtSeconds > now / 1000 || now / 1000 - data.authenticatedAtSeconds >= 300) return false
  const admission = data.admission
  return admission?.provider === "github"
    ? admission.invitationAdmitted === true && /^github-user-[1-9][0-9]*$/.test(data.accountId || "")
    : admission?.provider === "google" && admission.verifiedHostedDomain === "mclelland.ca" && /^google-user-[A-Za-z0-9._-]{1,64}$/.test(data.accountId || "")
}

export function createBetaAccessClient({ document, location, fetch: fetchImpl, schedule = (fn) => setTimeout(fn, 2000), cancel = clearTimeout, now = Date.now }) {
  const byId = (id) => document.getElementById(id)
  const github = byId("github-start")
  const google = byId("google-start")
  const status = byId("beta-access-status")
  const stage = byId("beta-access-state")
  const check = byId("beta-access-check")
  const signout = byId("beta-access-signout")
  const actions = byId("beta-access-actions")
  const device = byId("beta-access-device")
  const code = byId("beta-access-code")
  const link = byId("beta-access-link")
  let apiOrigin
  let csrf = ""
  let generation = 0
  let controller
  let poll
  let busy = false
  let pollDeadline = now() + 300000

  try {
    const configured = document.querySelector('meta[name="citadel-beta-api-origin"]')?.content || location.origin
    const url = new URL(configured)
    const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.origin === location.origin
    if (url.origin !== configured || (url.protocol !== "https:" && !local)) throw new AccessCheckError()
    apiOrigin = url.origin
  } catch {
    status.hidden = false
    status.textContent = "The beta access connection is not configured. No account has been connected."
    stage.textContent = "Connection needed"
    return { ready: false, stop() {} }
  }

  function clearDevice() {
    device.hidden = true
    code.textContent = ""
    link.removeAttribute("href")
  }

  function reset() {
    generation += 1
    controller?.abort()
    cancel(poll)
    poll = undefined
    csrf = ""
    clearDevice()
    return generation
  }

  function controls(locked) {
    github.disabled = locked
    google.disabled = locked
    check.disabled = locked
    signout.disabled = locked
  }

  function failed(message) {
    clearDevice()
    status.hidden = false
    actions.hidden = false
    signout.hidden = !csrf
    stage.textContent = "Check incomplete"
    status.textContent = message
    check.hidden = false
  }

  async function request(path, body) {
    controller = new AbortController()
    const pending = controller
    const timeout = setTimeout(() => pending.abort(), 10000)
    try {
      const response = await fetchImpl(apiOrigin + PREFIX + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        redirect: "error",
        cache: "no-store",
        signal: pending.signal,
        headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Box-CSRF": csrf },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) throw new AccessCheckError(`Beta access check failed (HTTP ${response.status}). No eligibility result was returned.`)
      if (!response.headers.get("content-type")?.includes("application/json")) throw new AccessCheckError("The beta access service did not return a session. No eligibility result was returned.")
      return await response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  function render(data) {
    status.hidden = false
    actions.hidden = data.status === "anonymous"
    csrf = data.csrf
    clearDevice()
    check.hidden = data.status === "anonymous"
    signout.hidden = data.status === "anonymous"
    stage.textContent = { anonymous: "Sign in", pending: "Checking", eligible: "Access confirmed", refused: "Access not confirmed", expired: "Sign-in expired" }[data.status]
    status.textContent = {
      anonymous: "Choose GitHub or Google to check your beta access.",
      pending: "Waiting for provider sign-in and the beta access check.",
      eligible: `Beta access confirmed for ${data.accountId}.`,
      refused: "Access was not confirmed. The provider sign-in or beta access check was refused.",
      expired: "Your sign-in expired. Choose your provider to check access again.",
    }[data.status]
    if (data.status === "pending" && data.device) {
      device.hidden = false
      code.textContent = data.device.userCode
      link.href = data.device.verificationUri
    }
  }

  async function readSession(current) {
    const data = await request("/session")
    if (current !== generation) return null
    if (!validAccessSession(data, now())) throw new AccessCheckError("The beta access service returned an invalid or expired session. Access has not been confirmed.")
    render(data)
    return data
  }

  function continuePolling(current, data) {
    cancel(poll)
    if (data?.status !== "pending") return
    if (now() >= pollDeadline) {
      failed("The access check is still pending. Check status to continue this sign-in.")
      return
    }
    poll = schedule(() => refresh(current))
  }

  async function refresh(current = generation) {
    if (busy) return
    busy = true
    controls(true)
    try {
      const data = await readSession(current)
      if (current === generation) continuePolling(current, data)
    } catch (error) {
      if (current === generation) {
        csrf = ""
        failed(error?.name === "AbortError" ? "The access check timed out. No eligibility result was returned." : error instanceof AccessCheckError ? error.message : "The beta access service could not be reached or returned an invalid response. No eligibility result was returned.")
      }
    } finally {
      if (current === generation) { busy = false; controls(false) }
    }
  }

  async function start(provider) {
    if (busy) return
    const current = reset()
    busy = true
    controls(true)
    signout.hidden = true
    stage.textContent = "Checking"
    status.hidden = false
    status.textContent = "Connecting to the beta access service…"
    try {
      if (!await readSession(current) || current !== generation) return
      const result = await request("/sessions", { provider })
      if (current !== generation) return
      if (!result || result.ok === false) throw new AccessCheckError("The provider sign-in request was refused. Access has not been confirmed.")
      if (provider === "google") {
        const url = new URL(result.authorizationUrl)
        if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth") throw new AccessCheckError("Google did not return a valid sign-in address. Access has not been confirmed.")
        location.assign(url.href)
        return
      }
      if (result.status !== "pending") throw new AccessCheckError("GitHub did not start a sign-in. Access has not been confirmed.")
      pollDeadline = now() + 300000
      continuePolling(current, await readSession(current))
    } catch (error) {
      if (current === generation) failed(error?.name === "AbortError" ? "The sign-in request timed out. Check status before starting again." : error instanceof AccessCheckError ? error.message : "The sign-in request could not be confirmed. Check status before starting again.")
    } finally {
      if (current === generation) { busy = false; controls(false) }
    }
  }

  async function signOut() {
    if (busy || !csrf) return
    busy = true
    controls(true)
    cancel(poll)
    try {
      const data = await request("/session/signout", {})
      if (data.ok !== true || data.status !== "signed-out") throw new AccessCheckError("Sign-out was not confirmed. Check the current session before trying again.")
      reset()
      stage.textContent = "Sign in"
      actions.hidden = true
      status.textContent = "Signed out of this portal."
      signout.hidden = true
      check.hidden = true
    } catch (error) {
      failed(error instanceof AccessCheckError ? error.message : "Sign-out could not be confirmed. Check the current session before trying again.")
    } finally {
      busy = false
      controls(false)
    }
  }

  github.addEventListener("click", () => start("github"))
  google.addEventListener("click", () => start("google"))
  check.addEventListener("click", () => { pollDeadline = now() + 300000; return refresh() })
  signout.addEventListener("click", signOut)
  controls(false)
  return { ready: true, start, refresh, signOut, stop() { reset() } }
}

if (typeof document !== "undefined" && document.getElementById("beta-access-status")) {
  const client = createBetaAccessClient({ document, location, fetch: globalThis.fetch.bind(globalThis) })
  if (client.ready) { void client.refresh(); addEventListener("pagehide", () => client.stop(), { once: true }) }
}
