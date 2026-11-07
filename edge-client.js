// Static Box client. Trust only the contract loopback fixture. No consent, signout, or activation signing.
const FIXTURE = {
  entryOrigin: "http://127.0.0.1:43111",
  callbackOrigin: "http://127.0.0.1:43112",
  clientOrigin: "http://127.0.0.1:43113",
}
const STATUSES = new Set(["idle", "pending", "eligible", "refused", "expired"])

function sameFixture(data) {
  if (!data || typeof data !== "object") return false
  if (Object.keys(data).length !== 3) return false
  return data.entryOrigin === FIXTURE.entryOrigin
    && data.callbackOrigin === FIXTURE.callbackOrigin
    && data.clientOrigin === FIXTURE.clientOrigin
}

function bytesToBase64Url(bytes) {
  let binary = ""
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")
}

async function createPkce(crypto) {
  const raw = new Uint8Array(32)
  crypto.getRandomValues(raw)
  const verifier = bytesToBase64Url(raw)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  return { verifier, challenge: bytesToBase64Url(digest) }
}

function generationOf(session) {
  if (!session || session.status !== "eligible") return ""
  const offer = session.offer || {}
  return [
    session.accountId || "",
    offer.artifactSha256 || "",
    offer.sealedManifestDigest || "",
    offer.releaseDescriptorDigest || "",
    session.activationOwner || "",
  ].join("\n")
}

function browserMayDownload(session) {
  if (!session || session.status !== "eligible" || session.terminalConnected === true) return false
  const owner = session.activationOwner
  return owner == null || owner === "browser"
}

function findNotice(document) {
  const root = document.getElementById("public-content")
  if (!root || !root.childNodes) return null
  for (const node of root.childNodes) {
    if (node.nodeType === 3 && String(node.nodeValue || "").includes("unavailable in this local build")) return node
  }
  return null
}

function empty(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

async function createEdgeClient(env) {
  const document = env.document
  const location = env.location
  const fetchImpl = env.fetch
  const crypto = env.crypto
  const element = document.documentElement || { dataset: {} }
  let csrf = ""
  let latest = null
  let sessionEpoch = 0
  let sessionAbort = null
  let posting = false
  let cancelPoll = null
  let downloadAbort = null
  let activeGeneration = ""
  let downloading = false
  const spent = new Set()
  let mounted = null

  function mark(status) {
    element.dataset.edgeClient = status
  }

  function stopped() {
    return {
      status: element.dataset.edgeClient || "unavailable",
      async refresh() {},
      stop() { if (cancelPoll) cancelPoll() },
    }
  }

  if (!location || location.origin !== FIXTURE.clientOrigin) {
    mark("unavailable")
    return stopped()
  }

  let config
  try {
    const configResponse = await fetchImpl("/edge-client.json", { credentials: "omit" })
    if (!configResponse.ok) {
      mark("unavailable")
      return stopped()
    }
    config = await configResponse.json()
  } catch {
    mark("unavailable")
    return stopped()
  }
  if (!sameFixture(config)) {
    mark("unavailable")
    return stopped()
  }

  function edgeUrl(path) {
    return FIXTURE.entryOrigin + path
  }

  async function call(method, path, body, signal) {
    const headers = {}
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (method !== "GET") headers["X-Box-CSRF"] = csrf
    const response = await fetchImpl(edgeUrl(path), {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    const type = response.headers && response.headers.get ? response.headers.get("content-type") || "" : ""
    const data = type.includes("json") ? await response.json() : null
    return { response, data }
  }

  function stopPoll() {
    if (cancelPoll) cancelPoll()
    cancelPoll = null
  }

  function retireSessionRead() {
    sessionEpoch += 1
    if (sessionAbort) sessionAbort.abort()
    sessionAbort = null
  }

  function armPoll() {
    stopPoll()
    if (!latest || latest.status !== "pending") return
    const schedule = env.schedule || ((fn) => {
      const id = setInterval(() => { void fn() }, 3000)
      return () => clearInterval(id)
    })
    cancelPoll = schedule(() => refresh())
  }

  function abortDownload() {
    if (downloadAbort) downloadAbort.abort()
  }

  function ensureRoot() {
    if (mounted) return mounted
    mounted = document.createElement("div")
    mounted.id = "edge-client"
    const host = document.getElementById("member-access")
    if (host && host.appendChild) host.appendChild(mounted)
    return mounted
  }

  function paragraph(id, text) {
    const node = document.createElement("p")
    node.id = id
    node.className = "step-copy"
    node.textContent = text
    return node
  }

  function button(id, label, onClick) {
    const node = document.createElement("button")
    node.id = id
    node.type = "button"
    node.className = "provider-button"
    node.textContent = label
    node.addEventListener("click", onClick)
    return node
  }

  function renderUnavailable(text) {
    mark("unavailable")
    const root = ensureRoot()
    empty(root)
    const status = paragraph("edge-status", text || "unavailable")
    status.setAttribute("aria-live", "polite")
    root.appendChild(status)
  }

  function render(session) {
    const status = STATUSES.has(session.status) ? session.status : "unavailable"
    mark(status)
    const notice = findNotice(document)
    if (notice) notice.nodeValue = ""
    const root = ensureRoot()
    empty(root)
    const statusNode = paragraph("edge-status", status)
    statusNode.setAttribute("aria-live", "polite")
    root.appendChild(statusNode)
    if (typeof session.category === "string" && session.category) root.appendChild(paragraph("edge-category", session.category))
    if (typeof session.detail === "string" && session.detail) root.appendChild(paragraph("edge-detail", session.detail))
    const device = session.device
    if (status === "pending" && device && device.userCode) {
      root.appendChild(paragraph("edge-device-code", String(device.userCode)))
      const uri = String(device.verificationUri || "")
      if (/^https?:\/\//.test(uri)) {
        const link = document.createElement("a")
        link.id = "edge-device-link"
        link.href = uri
        link.textContent = uri
        root.appendChild(link)
      }
    }
    if (status === "eligible") {
      root.appendChild(paragraph("edge-account", String(session.accountId || "")))
      const offer = session.offer || {}
      if (offer.target) root.appendChild(paragraph("edge-offer-target", String(offer.target)))
      if (offer.artifactSha256) root.appendChild(paragraph("edge-offer-sha", String(offer.artifactSha256)))
      root.appendChild(paragraph("edge-offer-limit", "Eligible is not installation or a device license."))
    }
    root.appendChild(paragraph("edge-consent-gap", "GitHub consent on this page is not a Box consent endpoint."))
    root.appendChild(paragraph("edge-activation-gap", "This page does not sign device activation."))
    const terminal = /^#terminal=([0-9a-f]{64})$/.exec(String(location.hash || ""))
    if (terminal) {
      root.appendChild(paragraph("edge-terminal-id", terminal[1]))
      root.appendChild(button("edge-terminal-connect", "Connect this terminal", () => attachTerminal(terminal[1])))
    }
    if (session.terminalConnected === true || session.activationOwner === "terminal") {
      root.appendChild(paragraph("edge-terminal-owned", "A terminal owns this session. This browser will not download independently."))
    }
    const gen = generationOf(session)
    if (browserMayDownload(session)) {
      const download = button("edge-download", "Download Box candidate", () => startDownload(gen))
      download.disabled = spent.has(gen) || downloading
      root.appendChild(download)
    }
    if (downloading) {
      root.appendChild(button("edge-cancel", "Cancel download", () => {
        spent.add(activeGeneration)
        abortDownload()
      }))
    }
    if (gen && spent.has(gen)) root.appendChild(paragraph("edge-download-spent", "This download was already attempted and will not be retried."))
  }

  function bindProviders() {
    const github = document.getElementById("github-start")
    const google = document.querySelector ? document.querySelector('[data-provider="Google"]') : null
    if (github) {
      github.disabled = false
      github.addEventListener("click", () => startProvider("github"))
    }
    if (google) {
      google.disabled = false
      google.addEventListener("click", () => startProvider("google"))
    }
  }

  async function startProvider(provider) {
    if (posting || !/^[0-9a-f]{64}$/.test(csrf)) return
    posting = true
    abortDownload()
    stopPoll()
    retireSessionRead()
    try {
      const result = await call("POST", "/api/box/private-installer/sessions", { provider })
      const data = result.data || {}
      if (!result.response.ok || data.ok === false) {
        render(Object.assign({ status: "refused" }, data))
        return
      }
      if (provider === "google") {
        if (typeof data.authorizationUrl === "string" && data.authorizationUrl && typeof location.assign === "function") {
          location.assign(data.authorizationUrl)
          return
        }
        renderUnavailable("unavailable")
        return
      }
      await refresh()
    } catch {
      renderUnavailable("unavailable")
    } finally {
      posting = false
    }
  }

  async function attachTerminal(id) {
    if (!/^[0-9a-f]{64}$/.test(csrf) || !/^[0-9a-f]{64}$/.test(id)) return
    abortDownload()
    stopPoll()
    retireSessionRead()
    try {
      const result = await call("POST", "/api/box/private-installer/terminal/attach", { id })
      if (!result.response.ok || (result.data && result.data.ok === false)) {
        render(Object.assign({}, latest || { status: "refused" }, { detail: result.data && result.data.detail }))
        return
      }
    } catch {
      renderUnavailable("unavailable")
      return
    }
    await refresh()
  }

  async function startDownload(gen) {
    if (!gen || spent.has(gen) || downloading || !browserMayDownload(latest) || generationOf(latest) !== gen) return
    downloading = true
    spent.add(gen)
    activeGeneration = gen
    downloadAbort = new AbortController()
    render(latest)
    try {
      const pkce = await createPkce(crypto)
      const auth = await call("POST", "/api/box/private-installer/authorizations", { challenge: pkce.challenge }, downloadAbort.signal)
      const broken = !latest || generationOf(latest) !== gen || !browserMayDownload(latest) || downloadAbort.signal.aborted
      if (broken || !auth.response.ok || !auth.data || auth.data.authorization == null) return
      const file = await call("POST", "/api/box/private-installer/download", {
        authorization: auth.data.authorization,
        verifier: pkce.verifier,
      }, downloadAbort.signal)
      const type = file.response.headers && file.response.headers.get ? file.response.headers.get("content-type") || "" : ""
      if (downloadAbort.signal.aborted || !file.response.ok || !type.includes("application/octet-stream")) return
      const bytes = new Uint8Array(await file.response.arrayBuffer())
      const disposition = file.response.headers.get("content-disposition") || ""
      const named = /filename="([^"]+)"/.exec(disposition)
      const name = named ? named[1] : "box-candidate"
      if (env.deliverBytes) env.deliverBytes(bytes, name)
      else deliverInPage(bytes, name)
    } catch {
      return
    } finally {
      downloading = false
      downloadAbort = null
      if (latest) render(latest)
    }
  }

  function deliverInPage(bytes, name) {
    const blob = new Blob([bytes], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.hidden = true
    const host = document.body || document.getElementById("member-access")
    if (!host || !host.appendChild) return
    host.appendChild(link)
    if (link.click) link.click()
    if (link.remove) link.remove()
    URL.revokeObjectURL(url)
  }

  async function refresh() {
    const epoch = ++sessionEpoch
    if (sessionAbort) sessionAbort.abort()
    const controller = new AbortController()
    sessionAbort = controller
    try {
      const got = await call("GET", "/api/box/private-installer/session", undefined, controller.signal)
      if (epoch !== sessionEpoch) return
      const data = got.data
      if (!got.response.ok || !data || !STATUSES.has(data.status)) {
        latest = { status: "unavailable" }
        renderUnavailable("unavailable")
        stopPoll()
        abortDownload()
        return
      }
      latest = data
      if (downloadAbort && (!browserMayDownload(latest) || generationOf(latest) !== activeGeneration)) abortDownload()
      render(latest)
      armPoll()
    } catch {
      if (epoch !== sessionEpoch) return
      latest = { status: "unavailable" }
      renderUnavailable("unavailable")
      stopPoll()
      abortDownload()
    }
  }

  let bootstrap
  try {
    bootstrap = await call("GET", "/api/box/private-installer/session/bootstrap")
  } catch {
    mark("unavailable")
    return stopped()
  }
  const token = bootstrap.data && bootstrap.data.csrf
  if (!bootstrap.response.ok || !/^[0-9a-f]{64}$/.test(token || "")) {
    mark("unavailable")
    return stopped()
  }
  csrf = token
  bindProviders()
  await refresh()
  return {
    status: element.dataset.edgeClient,
    async refresh() { await refresh() },
    stop() { stopPoll(); retireSessionRead(); abortDownload() },
  }
}

globalThis.createEdgeClient = createEdgeClient
if (globalThis.document && globalThis.document.getElementById && globalThis.document.getElementById("member-access")) {
  void createEdgeClient({
    document: globalThis.document,
    fetch: globalThis.fetch,
    location: globalThis.location,
    crypto: globalThis.crypto,
  })
}
