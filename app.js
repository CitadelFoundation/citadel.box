function bindPortalPage() {
let downloadAttempt = 0
let consentAttempt = 0
let activationAttempt = 0
let exchangeAttempt = 0
const statementId = "citadel-private-beta-consent-1"

const reasons = {
  "account-invalid": "Enter the wallet address.",
  "program-required": "Choose the private beta program.",
  "profile-required": "Choose the Sonic 146 issuer profile.",
  "statement-mismatch": "The consent text on this page is not the current statement. Refresh the page and read it again before you record consent.",
  "consent-required": "Record consent first. Check the box and use Record consent. This enrollment consent is separate from GitHub consent. Withdrawing it does not block the installer.",
  "counterfactual-unsupported": "A counterfactual wallet is only a predicted address for a contract that is not deployed yet. Choose an ordinary account or a deployed contract wallet.",
  "unauthenticated": "Sign in with the enrolled account first.",
  "challenge-mismatch": "The signature does not match this session's challenge. Sign in again to get a new one.",
  "clock-rollback": "The clock moved backwards, so this attempt was refused. Start sign-in again.",
  "expired": "The challenge expired. Sign in again to get a new one.",
  "refused": "The signature was refused. No transaction was sent, and you can sign in again if you want to continue.",
  "replay": "That signature was already used. Sign in again for a new challenge.",
  "invalid-signature": "The signature does not show control of this account. Sign in again with the enrolled account.",
  "verifier-unavailable": "The contract-wallet check is unavailable right now, so sign-in stays closed. No transaction was sent. You can try again later.",
  "wallet-kind-mismatch": "The wallet type does not match the challenge. Sign in again and keep the same wallet type.",
  "session-expired": "The sign-in expired. Sign in again to continue.",
  "trust-root-unavailable": "This local portal has no signed release pin. That pin is the signed record of the installer bytes, so the installer cannot be checked.",
  "checksum-without-trust": "A checksum alone does not authenticate the installer.",
  "trust-signature-invalid": "The release-pin signature could not be verified. The pin is the signed record of the installer bytes.",
  "pin-unsupported": "The release pin does not match the private-beta installer record.",
  "artifact-unavailable": "Installer files are not configured for this local portal.",
  "method-not-allowed": "Use the request on this page. Another method is not accepted.",
  "opt-in-required": "Issuer authority is still unset. You can opt in or leave it unset. This does not change your enrollment choice.",
  "user-refused": "You declined issuer authority. Your enrollment stands as it is, and you can opt in later if you choose.",
  "authority-unavailable": "No issuer is connected. Authority stays pending, and enrollment is unchanged.",
  "authority-unconfigured": "You opted in. No issuer profile is configured here, so this stays pending.",
  "authority-mismatch": "The authority evidence does not match the issuer profile you chose, so this was refused.",
  "unfinalized": "The evidence is not finalized, so this stays pending.",
  "live-authority-unavailable": "The fields match a supplied profile, but there is still no live authority proof. This stays pending.",
  "issuer-unavailable": "No issuer is connected, so entitlement stays pending.",
  "issuer-not-integrated": "A claimed issuer grant is not connected here, so entitlement stays pending.",
  "providers-unavailable": "Both finalized provider histories are needed before eligibility can be decided, so this stays pending.",
  "provider-disagreement": "The two providers disagree, so qualification stays pending. Disagreement is not a pass.",
  "evidence-insufficient": "A balance or a signature is not enough. This page cannot treat either one as qualification.",
  "history-incomplete": "The supplied holdings history is incomplete, so this stays pending until both providers return a complete history.",
  "history-inconsistent": "The supplied history contradicts itself, so this stays pending. It was not accepted.",
  "below-policy": "This account is below the seven-day BZ or veEQUAL level, so it is not qualified. The check is finished.",
  "reentry-unsatisfied": "After a gap in holdings, this account is not qualified. Supplied history needs seven continuous days at the BZ threshold, or an earlier activation with at least 13 weeks of veEQUAL lock at 20,000 effective veEQUAL.",
  "first-activation": "Supplied history meets the first seven-day policy.",
  "bz-reentry": "Supplied history meets BZ re-entry.",
  "ve-reentry": "Supplied history meets veEQUAL re-entry.",
  "owner-mismatch": "The supplied history names a different owner than this account, so it does not qualify this account.",
  "identity-mismatch": "The supplied history is not for the Sonic 146 BZ and veEQUAL contracts, so it does not qualify this account.",
  "received-delegation-excluded": "Received delegation does not count toward veEQUAL, so it is not qualification.",
  "locked-principal-excluded": "Locked principal does not count as veEQUAL voting power, so it is outside this policy.",
  "test-fixture-not-admitted": "A test fixture is not an entitlement. It does not admit the account.",
  "native-dev-not-admitted": "Source development mode is not an entitlement. It does not admit the account.",
  "self-attested-not-admitted": "A self-signed holdings claim is not an entitlement. It does not admit the account.",
  "hmac-not-admitted": "An HMAC claim is not a live entitlement. It does not admit the account.",
  "github-unauthenticated": "Sign in with GitHub to continue this request.",
  "github-expired": "GitHub sign-in expired. Start it again.",
  "statement-unaccepted": "No GitHub download-consent statement is available. Consent cannot be recorded here.",
  "github-consent-required": "Record GitHub consent for this GitHub sign-in. Withdrawn consent blocks the installer.",
  "github-consent-mismatch": "This GitHub consent belongs to a different sign-in. Record consent again for this GitHub account.",
  "github-consent-time": "This GitHub consent is outside the time for this sign-in. Record it again.",
  "roster-denied": "This GitHub account is not admitted.",
  "provider-unavailable": "The admission check is unavailable.",
  "auth-stale": "The GitHub sign-in is too old for this request. Start GitHub sign-in again.",
  "auth-rejected": "GitHub did not accept this sign-in for the request.",
  "activation-request-rejected": "This activation request could not be used. Check the public request from Box and try again.",
  "activation-request-mismatch": "The activation request does not match this GitHub sign-in.",
  "device-proof-required": "This portal cannot complete device possession.",
  "device-proof-rejected": "A supplied device proof was refused.",
  "activation-request-stale": "The activation request is outside the allowed time.",
  "grant-outcome-fenced": "That activation request no longer matches the earlier result.",
}

function say(id, code) {
  const node = document.getElementById(id)
  if (id === "download-status" && code === "identity-mismatch") {
    node.textContent = "The bytes do not match the signed artifact identity. No installer file was downloaded."
    return
  }
  const text = reasons[code] || code || ""
  node.textContent = id === "download-status" && reasons[code] ? `${text} No installer file was downloaded.` : text
}

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const type = response.headers.get("content-type") || ""
  if (type.includes("json")) return { ok: response.ok, status: response.status, data: await response.json() }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const disposition = response.headers.get("content-disposition") || ""
  return { ok: response.ok, status: response.status, bytes, disposition }
}

function downloadName(disposition) {
  const header = String(disposition || "")
  const starred = /filename\*\s*=\s*([^;]+)/i.exec(header)
  let name = ""
  if (starred) {
    const raw = starred[1].trim().replace(/^"(.*)"$/, "$1")
    const encoded = raw.includes("''") ? raw.split("''").slice(1).join("''") : raw
    try {
      name = decodeURIComponent(encoded)
    } catch {
      name = ""
    }
  } else {
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
    if (plain) name = (plain[2] !== undefined ? plain[2] : plain[1]).trim()
  }
  name = name.trim()
  if (!name || name.includes("/") || name.includes("\\") || name.includes("\0") || name === "." || name === "..") return ""
  return name
}

function saveDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function accountValue() {
  return document.getElementById("account").value.trim()
}

async function refresh() {
  let status
  try { status = await api("GET", "/status") } catch {}
  if (!status?.ok || !status.data) {
    await refreshMemberAccess()
    return
  }
  const data = status.data
  if (data.epochDeadline) {
    document.getElementById("epoch").textContent = `Current deadline ${data.epochDeadline} (Thursday 00:00 UTC)`
  }
  if (data.enrollment && data.enrollment.enrolled) {
    say("enrollment-status", `Consent is recorded for ${data.enrollment.account}.`)
  } else if (data.enrollment && data.enrollment.consent === false) {
    say("enrollment-status", "Consent is withdrawn. You can record it again if you want to continue.")
  } else {
    say("enrollment-status", "")
  }
  if (data.session && data.session.state === "verified") {
    say("wallet-status", `Signed in as ${data.session.account}. This is wallet control only, not holdings eligibility.`)
  } else if (data.session && data.session.state === "refused") {
    say("wallet-status", "refused")
  } else if (data.session && data.session.state === "expired") {
    say("wallet-status", "session-expired")
  } else {
    say("wallet-status", "")
  }
  if (!data.session || data.session.state !== "challenge") {
    document.getElementById("challenge").textContent = ""
  }
  if (data.qualification) {
    const chain = data.qualification.chainRead === "not-performed" ? " Chain read: not performed." : ""
    say("qualification-status", `${reasons[data.qualification.reason] || data.qualification.reason}${chain}`)
  } else {
    say("qualification-status", "")
  }
  if (data.authority) say("authority-status", data.authority.reason)
  else say("authority-status", "")
  if (data.entitlement) say("entitlement-status", data.entitlement.reason)
  else say("entitlement-status", "")
  await refreshMemberAccess()
}

async function refreshMemberAccess() {
  try { await showGithubConsent() } catch {
    clearGithubAffirm()
    document.getElementById("github-consent-status").textContent = "Download consent is unavailable here. Nothing was recorded."
  }
  await showMember()
}

document.getElementById("enroll-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const consent = document.getElementById("consent").checked
  const result = await api("POST", "/enrollment", {
    account: accountValue(),
    programId: document.getElementById("program").value,
    profileId: document.getElementById("profile").value,
    statementId,
    consent,
  })
  if (!result.ok) {
    say("enrollment-status", result.data.error)
    return
  }
  await refresh()
})

document.getElementById("withdraw").addEventListener("click", async () => {
  const result = await api("POST", "/enrollment/withdraw")
  if (!result.ok) {
    say("enrollment-status", result.data.error)
    return
  }
  await refresh()
})

document.getElementById("sign-in").addEventListener("click", async () => {
  const walletKind = document.getElementById("wallet-kind").value
  const challenge = await api("POST", "/siwe/challenge", { account: accountValue(), walletKind })
  if (!challenge.ok) {
    say("wallet-status", challenge.data.error)
    return
  }
  document.getElementById("challenge").textContent = challenge.data.message
  const ethereum = window.ethereum
  if (!ethereum) {
    await refresh()
    say("wallet-status", "No wallet is available in this browser. The challenge is ready below, and nothing was sent on chain. You can leave it or use a browser that has a wallet.")
    return
  }
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" })
    // EIP-4361: personal_sign the exact challenge text. No transaction method is called.
    const signature = await ethereum.request({
      method: "personal_sign",
      params: [challenge.data.message, accounts[0]],
    })
    const verified = await api("POST", "/siwe/verify", {
      message: challenge.data.message,
      signature,
      walletKind,
    })
    await refresh()
    if (!verified.ok) say("wallet-status", verified.data.error)
  } catch {
    await api("POST", "/siwe/reject")
    await refresh()
    say("wallet-status", "Sign-in did not complete. The wallet may have refused, or the request could not be verified — the reason is unknown. No transaction was sent. You can try sign-in again.")
  }
})

document.getElementById("reject-sign").addEventListener("click", async () => {
  const result = await api("POST", "/siwe/reject")
  if (!result.ok) {
    say("wallet-status", result.data.error)
    return
  }
  await refresh()
})

document.getElementById("opt-in").addEventListener("click", async () => {
  const result = await api("POST", "/authority/opt-in")
  say("authority-status", result.ok ? result.data.reason : result.data.error)
})

document.getElementById("refuse-authority").addEventListener("click", async () => {
  const result = await api("POST", "/authority/refuse")
  say("authority-status", result.ok ? result.data.reason : result.data.error)
})

document.getElementById("request-installer").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++downloadAttempt
  say("download-status", "Requesting the installer…")
  let result
  try { result = await api("POST", "/downloads/beta-installer") } catch {
    if (revision === githubRevision && attempt === downloadAttempt) say("download-status", "The installer download could not be confirmed. Check your browser's downloads before requesting it again.")
    return
  }
  if (revision !== githubRevision || attempt !== downloadAttempt) return
  if (result.bytes) {
    const filename = downloadName(result.disposition)
    const count = `The server returned ${result.bytes.byteLength} bytes after the trust checks.`
    if (!filename) {
      say("download-status", `${count} The response did not name a file, so no installer file was saved to your device.`)
      return
    }
    saveDownload(result.bytes, filename)
    say("download-status", `${count} Browser save requested for ${filename}.`)
    return
  }
  say("download-status", result.data.error)
})

function bindControl(id, label) {
  const found = document.getElementById(id)
  if (found) return found
  const node = document.createElement("button")
  node.id = id
  node.type = "button"
  node.textContent = label
  const anchor = document.getElementById("request-installer")
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor)
  else document.body.appendChild(node)
  return node
}

function bindStatus(id) {
  const found = document.getElementById(id)
  if (found) return found
  const node = document.createElement("p")
  node.id = id
  node.className = "status"
  node.setAttribute("role", "status")
  const anchor = document.getElementById("download-status")
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor)
  else document.body.appendChild(node)
  return node
}

bindStatus("github-status")
let githubFlowId = ""
try { githubFlowId = window.sessionStorage?.getItem("beta-github-flow") || "" } catch {}

function rememberGithubFlow(id) {
  githubFlowId = id
  try {
    if (id) window.sessionStorage?.setItem("beta-github-flow", id)
    else window.sessionStorage?.removeItem("beta-github-flow")
  } catch {}
  updateMemberControls()
}

let githubIdentified = false
function updateMemberControls() {
  document.getElementById("github-start").hidden = githubIdentified || !!githubFlowId
  document.getElementById("github-poll").hidden = !githubFlowId
  document.getElementById("github-signout").hidden = !githubIdentified && !githubFlowId
}

let memberRevision = 0
let signingOutGithub = false
let githubRevision = 0

function hideMember() {
  document.getElementById("member-page").hidden = true
  document.getElementById("member-account").textContent = ""
  document.getElementById("member-information").textContent = ""
  document.getElementById("public-content").hidden = false
}

async function showMember() {
  if (signingOutGithub) return
  const revision = ++memberRevision
  hideMember()
  const node = document.getElementById("member-status")
  node.textContent = "Connecting…"
  const retry = document.getElementById("member-refresh")
  retry.hidden = true
  try {
    const result = await api("GET", "/github/member")
    if (revision !== memberRevision) return
    const data = result.data || {}
    if (result.ok && (data.state === "expired" || data.state === "signed-out") && !githubFlowId) {
      document.getElementById("github-status").textContent = ""
      githubIdentified = false
      updateMemberControls()
    }
    if (result.ok && data.state === "member" && Number.isSafeInteger(data.accountId) && data.accountId > 0 && typeof data.information === "string") {
      githubIdentified = true
      updateMemberControls()
      document.getElementById("member-account").textContent = `GitHub account ${data.accountId}`
      document.getElementById("member-information").textContent = data.information
      document.getElementById("public-content").hidden = true
      document.getElementById("member-page").hidden = false
      node.textContent = "Welcome back. Here are your beta updates."
      return
    }
    const states = {
      "signed-out": githubFlowId ? "A GitHub sign-in is waiting. Use Check GitHub sign-in to continue." : "Sign in for your beta updates.",
      denied: "This GitHub account is not currently invited to the beta. Check beta access again after your invitation is confirmed, or sign out and use another account.",
      expired: "Your portal sign-in expired. Sign in with GitHub again to continue.",
      unavailable: "The member connection is unavailable here. Try again later.",
    }
    const state = result.ok && states[data.state] ? data.state : "unavailable"
    node.textContent = states[state]
    retry.hidden = state !== "denied" && state !== "unavailable"
    retry.textContent = state === "denied" ? "Check beta access" : "Try member access again"
  } catch {
    if (revision === memberRevision) {
      node.textContent = "The member connection is unavailable here. Try again later."
      retry.hidden = false
      retry.textContent = "Try member access again"
    }
  }
}

function focusMember() {
  if (!document.getElementById("member-page").hidden) document.getElementById("member-heading").focus?.()
}

document.getElementById("member-refresh").addEventListener("click", async () => {
  await showMember()
  focusMember()
})
document.getElementById("github-signout").addEventListener("click", async () => {
  if (signingOutGithub) return
  signingOutGithub = true
  ++githubRevision
  ++memberRevision
  hideMember()
  clearGithubAffirm()
  document.getElementById("download-status").textContent = ""
  document.getElementById("github-activation-status").textContent = ""
  document.getElementById("github-exchange-status").textContent = ""
  document.getElementById("github-consent-note").textContent = ""
  const node = document.getElementById("member-status")
  node.textContent = "Signing out…"
  try {
    const result = await api("POST", "/github/signout", { flowId: githubFlowId })
    if (!result.ok) throw new Error("signout-failed")
    githubIdentified = false
    rememberGithubFlow("")
    githubExchangeId = ""
    document.getElementById("github-status").textContent = ""
    document.getElementById("github-exchange-status").textContent = ""
    document.getElementById("github-exchange-signature").value = ""
    document.getElementById("github-activation-request-body").value = ""
    document.getElementById("github-consent-note").textContent = ""
    node.textContent = "Signed out of this portal. Future downloads need sign-in and consent again. Existing runtime licenses are unchanged."
  } catch {
    node.textContent = "Sign-out could not be confirmed. Try Sign out of this portal again."
  } finally {
    signingOutGithub = false
  }
})

bindControl("github-start", "Sign in with GitHub").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  let result
  try { result = await api("POST", "/github/device/start") } catch {
    if (revision === githubRevision) document.getElementById("github-status").textContent = "GitHub sign-in is unavailable. Try Sign in with GitHub again."
    return
  }
  if (revision !== githubRevision) return
  const data = result.data || {}
  if (!result.ok || data.state === "provider-unavailable" || !data.flowId) {
    document.getElementById("github-status").textContent = "GitHub sign-in is unavailable."
    return
  }
  rememberGithubFlow(String(data.flowId))
  document.getElementById("github-status").textContent = `GitHub code ${data.userCode}. Open ${data.verificationUri}. Expires ${data.expiresAt}.`
})

const GITHUB_CONSENT_HELPER = "You can cancel this permission later to stop future downloads. The beta is invite-only, and using Box requires a separate license."

bindStatus("github-consent-status")
bindStatus("github-consent-note")
function bindGithubHelper() {
  const found = document.getElementById("github-consent-helper")
  if (found) {
    if (!found.textContent) found.textContent = GITHUB_CONSENT_HELPER
    return found
  }
  const node = document.createElement("p")
  node.id = "github-consent-helper"
  node.textContent = GITHUB_CONSENT_HELPER
  const anchor = document.getElementById("request-installer")
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor)
  else document.body.appendChild(node)
  return node
}
bindGithubHelper()
function bindAgree(id) {
  const found = document.getElementById(id)
  if (found) return found
  const box = document.createElement("input")
  box.id = id
  box.type = "checkbox"
  const label = document.createElement("label")
  label.id = "github-consent-label"
  label.htmlFor = id
  label.textContent = "I'd like to download the Citadel Box beta using this GitHub account."
  const anchor = document.getElementById("request-installer")
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(box, anchor)
    anchor.parentNode.insertBefore(label, anchor)
  } else {
    document.body.appendChild(box)
    document.body.appendChild(label)
  }
  return box
}
bindAgree("github-consent-agree").checked = false
let shownGithubConsent = null

function githubReason(code) {
  if (code === "statement-mismatch") return "That GitHub consent statement is not the one on the server. Read the statement again before you record it."
  return reasons[code] || reasons["statement-unaccepted"]
}

function clearGithubCheck() {
  document.getElementById("github-consent-agree").checked = false
}

function clearGithubAffirm() {
  shownGithubConsent = null
  clearGithubCheck()
}

function paintOfferedStatement() {
  if (!shownGithubConsent) return
  document.getElementById("github-consent-status").textContent = shownGithubConsent.statement
  const label = document.getElementById("github-consent-label")
  if (label) label.textContent = shownGithubConsent.statement
}

async function showGithubConsent() {
  const offered = await api("GET", "/github/consent")
  const data = offered.data || {}
  const node = document.getElementById("github-consent-status")
  const box = document.getElementById("github-consent-agree")
  box.checked = false
  document.getElementById("github-consent-note").textContent = ""
  if (!offered.ok || data.available !== true || typeof data.statementId !== "string" || typeof data.statement !== "string") {
    shownGithubConsent = null
    node.textContent = githubReason(data.error)
    return
  }
  shownGithubConsent = { statementId: data.statementId, statement: data.statement }
  paintOfferedStatement()
}

bindControl("github-consent-record", "Record GitHub consent").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++consentAttempt
  const node = document.getElementById("github-consent-status")
  const note = document.getElementById("github-consent-note")
  const box = document.getElementById("github-consent-agree")
  if (!shownGithubConsent) {
    node.textContent = reasons["statement-unaccepted"]
    note.textContent = ""
    box.checked = false
    return
  }
  if (!box.checked) {
    paintOfferedStatement()
    note.textContent = "Read the GitHub consent statement and check the box before you record it. Consent was not recorded."
    return
  }
  note.textContent = "Recording GitHub consent…"
  let result
  try { result = await api("POST", "/github/consent", { statementId: shownGithubConsent.statementId, consent: true }) } catch {
    if (revision === githubRevision && attempt === consentAttempt) {
      box.checked = false
      note.textContent = "The GitHub consent record could not be confirmed. Check the current consent state before recording it again."
    }
    return
  }
  if (revision !== githubRevision || attempt !== consentAttempt) return
  box.checked = false
  paintOfferedStatement()
  if (!result.ok) {
    note.textContent = githubReason(result.data && result.data.error)
    return
  }
  note.textContent = "GitHub consent is recorded for this sign-in."
})

bindControl("github-consent-withdraw", "Withdraw GitHub consent").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++consentAttempt
  const note = document.getElementById("github-consent-note")
  note.textContent = "Withdrawing GitHub consent…"
  let result
  try { result = await api("POST", "/github/consent/withdraw") } catch {
    if (revision === githubRevision && attempt === consentAttempt) note.textContent = "GitHub consent withdrawal could not be confirmed. Check the current consent state before requesting withdrawal again."
    return
  }
  if (revision !== githubRevision || attempt !== consentAttempt) return
  clearGithubCheck()
  paintOfferedStatement()
  note.textContent = result.ok
    ? "GitHub consent is withdrawn. The installer stays blocked until you record it again."
    : githubReason(result.data && result.data.error)
})

bindControl("github-poll", "Check GitHub sign-in").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  let result
  try { result = await api("POST", "/github/device/poll", { flowId: githubFlowId }) } catch {
    if (revision === githubRevision) document.getElementById("github-status").textContent = "GitHub sign-in could not be checked. Use Check GitHub sign-in to try again."
    return
  }
  if (revision !== githubRevision) return
  const data = result.data || {}
  const node = document.getElementById("github-status")
  if (data.state === "authenticated") {
    node.textContent = `GitHub account ${data.accountId} is signed in.`
    githubIdentified = true
    clearGithubAffirm()
    rememberGithubFlow("")
    await showGithubConsent()
    await showMember()
    focusMember()
    return
  }
  if (data.state === "pending") {
    node.textContent = "GitHub sign-in is still waiting."
    return
  }
  if (data.state === "denied") {
    rememberGithubFlow("")
    node.textContent = "GitHub sign-in was denied."
    return
  }
  if (data.state === "expired") {
    rememberGithubFlow("")
    node.textContent = "GitHub sign-in expired. Start it again."
    return
  }
  node.textContent = "GitHub sign-in is unavailable."
})

bindStatus("github-activation-status")
bindControl("github-activation-request", "Request activation").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++activationAttempt
  const node = document.getElementById("github-activation-status")
  const field = document.getElementById("github-activation-request-body")
  let activationRequest = null
  const text = field && typeof field.value === "string" ? field.value.trim() : ""
  if (text) {
    try {
      activationRequest = JSON.parse(text)
    } catch {
      node.textContent = reasons["activation-request-rejected"]
      return
    }
  }
  node.textContent = "Requesting activation…"
  let result
  try { result = await api("POST", "/github/activation", { activationRequest }) } catch {
    if (revision === githubRevision && attempt === activationAttempt) node.textContent = "The activation response could not be confirmed. Check the request's current result before requesting activation again."
    return
  }
  if (revision !== githubRevision || attempt !== activationAttempt) return
  const data = result.data || {}
  if (result.ok && data.ok === true && data.activationResponse) {
    node.textContent = `Activation response ${data.activationResponse.requestId} issued ${data.activationResponse.issuedAt}.`
    return
  }
  const code = data.reason || data.error
  node.textContent = reasons[code] || code || ""
})

bindStatus("github-exchange-status")
let githubExchangeId = ""

function bindRequestBody() {
  const id = "github-activation-request-body"
  const found = document.getElementById(id)
  if (found) return found
  const field = document.createElement("textarea")
  field.id = id
  field.spellcheck = false
  field.autocomplete = "off"
  const label = document.createElement("label")
  label.id = "github-activation-request-label"
  label.htmlFor = id
  label.textContent = "Activation request"
  const anchor = document.getElementById("request-installer")
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(label, anchor)
    anchor.parentNode.insertBefore(field, anchor)
  } else {
    document.body.appendChild(label)
    document.body.appendChild(field)
  }
  return field
}

function readExchangeRequest() {
  const field = document.getElementById("github-activation-request-body")
  const text = field && typeof field.value === "string" ? field.value.trim() : ""
  if (!text) throw new Error("empty")
  const activationRequest = JSON.parse(text)
  if (!activationRequest || typeof activationRequest !== "object" || Array.isArray(activationRequest)) {
    throw new Error("shape")
  }
  return { activationRequest }
}

function paintExchange(node, data) {
  if (data && data.ok === true && data.state === "pending") {
    githubExchangeId = String(data.exchangeId || githubExchangeId)
    const challenge = data.challenge || {}
    node.textContent = challenge.grantId
      ? `Device challenge ${challenge.grantId} for ${challenge.accountId} on ${challenge.deviceId} issued ${challenge.issuedAt}.`
      : "Device exchange is waiting for a challenge."
    return true
  }
  if (data && data.ok === true && data.activationResponse) {
    node.textContent = `Activation response ${data.activationResponse.requestId} issued ${data.activationResponse.issuedAt}.`
    return true
  }
  return false
}

function exchangeFailure(node, data) {
  const code = data && (data.reason || data.error)
  node.textContent = reasons[code] || code || ""
}

bindRequestBody()
bindControl("github-exchange-start", "Start device exchange").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++exchangeAttempt
  const node = document.getElementById("github-exchange-status")
  let body
  try {
    body = readExchangeRequest()
  } catch {
    node.textContent = reasons["activation-request-rejected"]
    return
  }
  node.textContent = "Starting device exchange…"
  let result
  try { result = await api("POST", "/github/device-exchange/start", body) } catch {
    if (revision === githubRevision && attempt === exchangeAttempt) node.textContent = "The device exchange start could not be confirmed. Check its current state before starting it again."
    return
  }
  if (revision !== githubRevision || attempt !== exchangeAttempt) return
  const data = result.data || {}
  if (paintExchange(node, data)) return
  exchangeFailure(node, data)
})

function bindExchangeLine(id) {
  const found = document.getElementById(id)
  if (found) return found
  const node = document.createElement("input")
  node.id = id
  node.type = "text"
  const anchor = document.getElementById("request-installer")
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor)
  else document.body.appendChild(node)
  return node
}
bindExchangeLine("github-exchange-signature")

bindControl("github-exchange-proof", "Submit device signature").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++exchangeAttempt
  const node = document.getElementById("github-exchange-status")
  const field = document.getElementById("github-exchange-signature")
  const signature = field && typeof field.value === "string" ? field.value.trim() : ""
  node.textContent = "Submitting the device signature…"
  let result
  try { result = await api("POST", "/github/device-exchange/proof", { exchangeId: githubExchangeId, signature }) } catch {
    if (revision === githubRevision && attempt === exchangeAttempt) node.textContent = "The device signature submission could not be confirmed. Check the exchange's current state before submitting it again."
    return
  }
  if (revision !== githubRevision || attempt !== exchangeAttempt) return
  const data = result.data || {}
  if (paintExchange(node, data)) return
  exchangeFailure(node, data)
})

bindControl("github-exchange-refresh", "Refresh device exchange").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++exchangeAttempt
  const node = document.getElementById("github-exchange-status")
  node.textContent = "Checking device exchange…"
  let result
  try { result = await api("GET", "/github/device-exchange/status?exchangeId=" + encodeURIComponent(githubExchangeId)) } catch {
    if (revision === githubRevision && attempt === exchangeAttempt) node.textContent = "The device exchange state could not be confirmed. Use Refresh device exchange to check it again."
    return
  }
  if (revision !== githubRevision || attempt !== exchangeAttempt) return
  const data = result.data || {}
  if (paintExchange(node, data)) return
  exchangeFailure(node, data)
})

bindControl("github-exchange-cancel", "Cancel device exchange").addEventListener("click", async () => {
  if (signingOutGithub) return
  const revision = githubRevision
  const attempt = ++exchangeAttempt
  const node = document.getElementById("github-exchange-status")
  node.textContent = "Cancelling device exchange…"
  let result
  try { result = await api("POST", "/github/device-exchange/cancel", { exchangeId: githubExchangeId }) } catch {
    if (revision === githubRevision && attempt === exchangeAttempt) node.textContent = "Device exchange cancellation could not be confirmed. Check its current state before requesting cancellation again."
    return
  }
  if (revision !== githubRevision || attempt !== exchangeAttempt) return
  const data = result.data || {}
  if (result.ok && data.ok === true && data.state === "cancelled") {
    githubExchangeId = ""
    node.textContent = "Device exchange is cancelled."
    return
  }
  exchangeFailure(node, data)
})

updateMemberControls()
refresh()
return { refresh }
}

function bindBootstrap(root, configuration = {}) {
  const button = root.getElementById("copy-install")
  if (!button) return
  const command = root.getElementById("install-command")
  const prompt = root.getElementById("install-prompt")
  const script = root.getElementById("install-script")
  const panel = root.getElementById("bootstrap-command-panel")
  const status = root.getElementById("copy-install-status")
  const tabs = [["unix", root.getElementById("bootstrap-os-unix")], ["windows", root.getElementById("bootstrap-os-windows")]].filter(([, tab]) => tab)
  const platforms = new Map([["unix", { command: command.textContent, scriptUrl: script?.getAttribute("href"), prompt: "$" }]])
  // Source-supplied configuration only; no endpoint inference or runtime discovery.
  // Never infer an endpoint or command from the platform name, URL, storage or user agent.
  const windows = configuration?.windows
  if (typeof windows?.command === "string" && windows.command.trim() && windows.command.length <= 4096 && !/[\r\n\0]/.test(windows.command)) {
    try {
      const url = new URL(windows.scriptUrl)
      if (url.protocol === "https:" && !url.username && !url.password && !url.hash) {
        platforms.set("windows", { command: windows.command, scriptUrl: url.href, prompt: ">" })
      }
    } catch {}
  }
  let feedbackTimer
  let presentationRevision = 0
  let copyAttempt = 0
  const clearFeedback = () => {
    clearTimeout(feedbackTimer)
    button.removeAttribute("data-copy-state")
    button.removeAttribute("data-feedback")
    status.textContent = ""
  }
  const select = (key) => {
    const selected = platforms.get(key)
    if (!selected) return
    ++presentationRevision
    ++copyAttempt
    clearFeedback()
    command.textContent = selected.command
    if (prompt) prompt.textContent = selected.prompt
    if (script && selected.scriptUrl) script.setAttribute("href", selected.scriptUrl)
    for (const [name, tab] of tabs) {
      tab.setAttribute("aria-selected", String(name === key))
      tab.tabIndex = name === key ? 0 : -1
      if (name === key) panel?.setAttribute("aria-labelledby", tab.id)
    }
  }
  for (const [key, tab] of tabs) {
    tab.disabled = !platforms.has(key)
    tab.setAttribute("aria-disabled", String(tab.disabled))
    if (!tab.disabled) tab.removeAttribute("title")
    tab.addEventListener("click", () => { if (!tab.disabled) select(key) })
    tab.addEventListener("keydown", (event) => {
      if (tab.disabled) return
      const available = tabs.filter(([, item]) => !item.disabled)
      const index = available.findIndex(([name]) => name === key)
      let next
      if (event.key === "ArrowRight") next = available[(index + 1) % available.length]
      if (event.key === "ArrowLeft") next = available[(index + available.length - 1) % available.length]
      if (event.key === "Home") next = available[0]
      if (event.key === "End") next = available[available.length - 1]
      if (next) { event.preventDefault(); select(next[0]); next[1].focus() }
    })
  }
  select("unix")
  button.addEventListener("click", async () => {
    const attempt = ++copyAttempt
    const revision = presentationRevision
    clearFeedback()
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("clipboard-unavailable")
      await globalThis.navigator.clipboard.writeText(command.textContent)
      if (attempt !== copyAttempt || revision !== presentationRevision) return
      status.textContent = "GM command copied."
      button.setAttribute("data-copy-state", "copied")
      button.setAttribute("data-feedback", "Copied")
    } catch {
      if (attempt !== copyAttempt || revision !== presentationRevision) return
      status.textContent = "Copy is unavailable here. Select the command and copy it."
      button.setAttribute("data-copy-state", "unavailable")
      button.setAttribute("data-feedback", "Select and copy")
    }
    feedbackTimer = setTimeout(() => {
      if (attempt === copyAttempt && revision === presentationRevision) clearFeedback()
    }, 1800)
  })
}

function bindSiteNavigation(root) {
  const menu = root.getElementById("menu-toggle")
  const mobile = root.getElementById("mobile-nav")
  const closeMenu = () => {
    menu.setAttribute("aria-expanded", "false")
    mobile.hidden = true
  }
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true"
    menu.setAttribute("aria-expanded", String(open))
    mobile.hidden = !open
  })
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
      closeMenu()
      menu.focus()
    }
  })
  root.querySelectorAll(".site-header a, .site-footer a").forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu()
    })
  })
  const scenarios = {
    maker: ["“I want AI as another pair of hands in my own workshop.”", "Your AI sits on the bench beside you. Less time joining the dots. More time making the things people come to you for."],
    team: ["“I want our way of working to show up in our tools.”", "When a job changes hands, the next person or AI agent needs the decisions behind it. Imagine tools that carry that context with the work."],
    independent: ["“I want my notes, my research and my family’s records kept my way.”", "What you know adds up: notes, findings, the records a family keeps. Imagine search and discovery that run on your own ground, with your knowledge staying yours."],
    organization: ["“I want our people and our AI agents building our Citadel together.”", "Many hands, human and AI, each bringing its own knowledge. Imagine one place that grows with everyone who helps build it."],
    dominion: ["“I want a world of our own making, held in common.”", "Many citadels with open gates between them, each shaped by the people inside. Imagine common ground that stays ours because everyone helps shape it."],
  }
  const tabs = [...root.querySelectorAll("[data-scenario]")]
  const select = (tab) => {
    for (const item of tabs) {
      item.setAttribute("aria-selected", String(item === tab))
      item.tabIndex = item === tab ? 0 : -1
    }
    const [quote, text] = scenarios[tab.dataset.scenario]
    root.getElementById("scenario-quote").textContent = quote
    root.getElementById("scenario-text").textContent = text
    root.getElementById("scenario-panel").setAttribute("aria-labelledby", tab.id)
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab))
    tab.addEventListener("keydown", (event) => {
      let next
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length]
      if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length]
      if (event.key === "Home") next = tabs[0]
      if (event.key === "End") next = tabs[tabs.length - 1]
      if (next) { event.preventDefault(); select(next); next.focus() }
    })
  })
}

if (typeof document.querySelectorAll === "function") bindSiteNavigation(document)
bindBootstrap(document, {
  windows: {
    command: "irm https://citadel.box/install.ps1 | iex",
    scriptUrl: "https://citadel.box/install.ps1",
  },
})
var portalPage = document.getElementById("member-access") && document.documentElement?.dataset?.installPreview !== "true" ? bindPortalPage() : null
