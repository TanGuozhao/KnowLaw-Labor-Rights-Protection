// Deploy: production uses `/api` (Nginx); local/file opens use `http://localhost:8080/api` (see API_BASE_URL).
import { getAuthToken } from "./auth.js";

export const API_BASE_URL =
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:8080/api"
    : "/api";

const DEFAULT_TIMEOUT_MS = 20000;
const LARGE_TRANSFER_TIMEOUT_MS = 60000;
/** 法律咨询发送消息：得理检索 + Query 改写 + 混元回复，常超过默认 20s */
const LEGAL_CONSULT_MESSAGE_TIMEOUT_MS = 180000;
/** 劳动合同审查：后端多轮补全（最多约 6 轮 LLM），总耗时常达数分钟 */
const CONTRACT_REVIEW_TIMEOUT_MS = 900000;
/** 与 Error 提示一致，勿使用 "\\uXXXX" 字面量（会原样显示在界面上） */
const MSG_REQUEST_FAILED = "请求失败，请稍后重试";
const MSG_REQUEST_TIMEOUT = "请求超时，请稍后重试";

function normalizePath(path) {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function buildApiUrl(path, query) {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const url = new URL(`${base}${normalizePath(path)}`, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    url.searchParams.set(key, text);
  });
  return url.toString();
}

function hasHeader(headers, name) {
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === name.toLowerCase());
}

function isFormDataBody(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function isJsonBody(body) {
  if (body == null || isFormDataBody(body)) return false;
  return Array.isArray(body) || Object.prototype.toString.call(body) === "[object Object]";
}

function buildHeaders(headers = {}, { hasJsonBody = false } = {}) {
  const next = { ...headers };
  const token = getAuthToken();
  if (hasJsonBody && !hasHeader(next, "Content-Type")) {
    next["Content-Type"] = "application/json";
  }
  if (token && !hasHeader(next, "Authorization")) {
    next.Authorization = `Bearer ${token}`;
  }
  return next;
}

function withTimeout(signal, timeoutMs) {
  if (!(timeoutMs > 0)) {
    return {
      signal,
      cleanup() {},
    };
  }

  const controller = new AbortController();
  let onAbort = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      onAbort = () => controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timerId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timerId);
      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

async function parseJsonSafely(response) {
  if (!response || response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalizeErrorMessage(message, fallback = "") {
  const raw = String(message ?? "").trim();
  if (!raw) return fallback;
  if (!/\\u[0-9a-fA-F]{4}/.test(raw)) return raw;
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
  } catch {
    return raw;
  }
}

async function buildError(response, fallbackMessage) {
  const text = (await response.text()) || "";
  const status = response.status || 0;
  let data = {};
  try {
    if (text) data = JSON.parse(text);
  } catch {
    /*非 JSON（如 nginx HTML、502 页） */
  }
  const apiMsg = normalizeErrorMessage(data?.message, "").trim();
  if (apiMsg) {
    return new Error(status ? `${apiMsg}（HTTP ${status}）` : apiMsg);
  }
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (snippet) {
    return new Error(`${fallbackMessage}（HTTP ${status}：${snippet}）`);
  }
  return new Error(`${fallbackMessage}（HTTP ${status}）`);
}

async function request(path, options = {}) {
  const {
    method = "GET",
    headers,
    body,
    query,
    responseType = "json",
    timeoutMs = responseType === "blob" ? LARGE_TRANSFER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
    signal,
  } = options;

  const hasJsonBody = isJsonBody(body);
  const payload = hasJsonBody ? JSON.stringify(body) : body;
  const { signal: requestSignal, cleanup } = withTimeout(signal, timeoutMs);

  try {
    const response = await fetch(buildApiUrl(path, query), {
      method,
      headers: buildHeaders(headers, { hasJsonBody }),
      body: payload,
      signal: requestSignal,
    });

    if (responseType === "blob") {
      if (!response.ok) {
        throw await buildError(response, MSG_REQUEST_FAILED);
      }
      const blob = await response.blob();
      return {
        blob,
        headers: response.headers,
        contentType: (response.headers.get("content-type") || "").toLowerCase(),
      };
    }

    const data = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(normalizeErrorMessage(data.message, MSG_REQUEST_FAILED));
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError" || error === "timeout") {
      throw new Error(MSG_REQUEST_TIMEOUT);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    cleanup();
  }
}

function parseExportFilename(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore invalid encoded filename */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quoted) return quoted[1];
  return fallback;
}

function triggerBlobDownload(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadBlob(path, fallbackFilename) {
  const { blob, headers } = await request(path, { responseType: "blob" });
  const filename = parseExportFilename(headers.get("Content-Disposition"), fallbackFilename);
  triggerBlobDownload(blob, filename);
}

async function postDownloadBlob(path, body, fallbackFilename) {
  const { blob, headers } = await request(path, {
    method: "POST",
    body: body || {},
    responseType: "blob",
  });
  const filename = parseExportFilename(headers.get("Content-Disposition"), fallbackFilename);
  triggerBlobDownload(blob, filename);
}

export async function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export async function register(payload) {
  return request("/auth/register", {
    method: "POST",
    body: payload,
  });
}

export async function getCurrentProfile() {
  return request("/auth/me");
}

export async function updateProfile(payload) {
  return request("/auth/profile", {
    method: "PATCH",
    body: payload,
  });
}

export async function changePassword(payload) {
  return request("/auth/change-password", {
    method: "POST",
    body: payload,
  });
}

export async function resetPassword(payload) {
  return request("/auth/reset-password", {
    method: "POST",
    body: payload,
  });
}

export async function logout() {
  return request("/auth/logout", {
    method: "POST",
  });
}

/** 闂備浇顕уù鐑藉极閹间降鈧焦绻濋崶銊ュ墾婵炲濮撮鍡涘疾椤掑嫭鐓曟い鎰╁€曢弸娆戠磼鐏炶姤鍋ラ柡灞剧缁犳盯骞橀搹顐ｎ啀闂備胶鍎甸崜婵嬪垂閸ф鏋佺€广儱妫楃欢鐐寸箾閹寸偞鐨戞い锔诲枟缁绘稓鈧數顭堝瓭闂佺娅曢幐楣冨箲閵忋倕绠ｉ柨鏇楀亾闁绘劕锕弻锝夊箛椤栨氨姣夋繛鎾村焹閸嬫挾鈧娲栧﹢閬嶅焵椤掑﹦绉靛ù婊勭箘缁牓鍩€椤掍胶绡€?*/
export async function chat(payload) {
  return request("/chat", {
    method: "POST",
    body: payload,
  });
}

/** 缂傚倸鍊风欢锟犲磻閸℃瑥鍨濇い鏍亼閳ь兛绀侀濂稿川閸屾稓娲撮柛鈹惧亾濡炪倖甯掗崐褰掞綖閺囩喆浜滄い鎰靛亜閺嬨倗绱掗埀顒勫礋椤撴稑浜鹃柣銏ゆ涧椤ｅ吋銇勯妸銉уⅵ妤犵偛鍟换婵嬪炊閵婏附鐝┑鐘灱閸╂牜绮欓幘鍓佺焼濠㈣泛艌濡插牓鏌熼悙顒€鈻曟い搴㈩殕閵囧嫰寮撮妸銉︾亾闂佸綊顥撴慨鎾煘閹达箑鐐婃い顓熷浮閻涙粓姊?*/
export async function retrievalCases(payload) {
  return request("/retrieval", {
    method: "POST",
    body: payload,
  });
}

export async function getLawInfo(lawId, merge = true) {
  return request("/law-info", {
    method: "GET",
    query: {
      lawId: String(lawId || ""),
      merge: merge ? "true" : "false",
    },
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
}

/** 闂傚倷绀侀幉锟犲蓟閵娾晛鐤柟绋垮閸欏繘鏌嶉崫鍕櫣閻熸瑱绠撻弻娑㈩敃閿濆洨鐣洪梺绋匡龚妞村摜鎹㈠☉銏犵闁惧浚鍋勫▍锝夋倵鐟欏嫭绀堥柛鐘虫崌閸┾偓妞ゆ巻鍋撻柛妯荤矒瀹曟粌鈹戠€ｎ偄浜楅梺璺ㄥ枔婵敻寮查鍕厱妞ゆ劗濮撮悘鈺傘亜韫囷絼绨界紒杈ㄥ浮瀵剙鈻庨幆褍澹夐梺姹囧焺閸ㄩ亶骞愰崘鑼殾闁挎繂顦伴弲鏌ョ叓閸ャ劍绀堟い锔诲櫍濮婂宕掑鍗炩叡闂佺顑囬崑鐔封槈閻㈠灚宕夊〒姘煎灠濞堫偊鏌ｆ惔顖滅У濞存粍绻勬禍鎼佸箳濡や礁浠?/api/chat闂?*/
export async function runContractReview(payload) {
  return request("/contract-review/run", {
    method: "POST",
    body: payload || {},
    timeoutMs: CONTRACT_REVIEW_TIMEOUT_MS,
  });
}

/** 闂傚倷绀侀幉锟犲蓟閵娾晛鐤柟绋垮閸欏繘鏌嶉崫鍕櫣閻熸瑱绠撻弻娑㈩敃閿濆洨鐣洪梺绋匡龚娴滎剛妲愰幘瀛樺閻熸瑥瀚棄宥夋⒑鐠囨彃鐦ㄩ柛銊ㄦ硾閻ｇ兘鎮╃拠鎻掑敤闂侀潧顭粻鎴﹀几閳ь剟姊洪懡銈呮瀾婵炲弶鍨瑰▎銏ゅΧ閸ヮ煈娼熷┑鐐叉閹稿宕戦幋鐐簻闁圭儤鍨甸埀顒佹閵囨劕鐣濋崟顒傚幍闂佽鍘界敮鎺楀礉濮樿鲸鍠愰柣妤€鐗忓ú鎾煛?*/
export async function runContractSummary(payload) {
  return request("/contract-review/summary", {
    method: "POST",
    body: payload || {},
    timeoutMs: CONTRACT_REVIEW_TIMEOUT_MS,
  });
}

export async function listConversations() {
  return request("/conversations");
}

export async function createConversation(payload = {}) {
  return request("/conversations", {
    method: "POST",
    body: payload,
  });
}

export async function updateConversation(conversationId, payload) {
  return request(`/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteConversation(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}

export async function listConversationMessages(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/messages`);
}

/** 闂傚倷绶氬鑽ゆ嫻閻旂厧绀夌€光偓閸曨偆鐣洪梺瑙勫劤椤曨參鍩㈤弮鍫熺厓鐟滄粓宕滃鎵佸亾閻㈤潧甯舵い顐ｇ箓閻ｇ兘宕堕妸銏＄亖闂傚倷绀侀幉锟犲礉閺囥垹绠犻幖娣妼閻ゎ噣鏌熼幑鎰靛殭缂佲偓閸岀偞鐓忓璇″灠鐎氼厼鈻撻姀銈嗏拺閻熸瑥瀚亸锕傛煛閳ь剚娼忛埡鍐厠闂佺粯鍨煎Λ鍕不閹烘挶浜滈柡宥冨墸濮樿泛纾婚柟鎯х摠婵挳鏌ｉ敐鍛拱妞ゆ柨绉瑰鍝劽虹紒妯衡枏闂佸憡鏌ㄧ粔鐑藉疮椤栫偞鈷戦柟鑲╁仜婵″吋銇勯幋婵囧殗闁瑰磭鍠栭幃銏ゆ偂鎼达綆妲版繝鐢靛仜濡鎹㈤幇顒夊殨闁规儼濮ら悡鏇㈡煛閸屾粌鍔嬫繛鍛椤儻顦崇紒顔肩焸閸┿儲寰勯幇顒勫敹闂佺粯鏌ㄦ晶搴ｇ矆閳?*/
export async function sendConversationMessage(conversationId, payload) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: payload,
    timeoutMs: LEGAL_CONSULT_MESSAGE_TIMEOUT_MS,
  });
}

export async function listCases() {
  return request("/cases");
}

/** LLM 润色文书草稿（需配置 backend LLM；失败时返回 503 及 message） */
export async function polishDocumentDraft(payload) {
  return request("/documents/polish", {
    method: "POST",
    body: payload,
  });
}

/** LLM 抽取劳动监察投诉书字段（返回英文变量名键值对） */
export async function extractLaborComplaintFields(payload) {
  return request("/documents/extract-fields", {
    method: "POST",
    body: payload,
  });
}

export async function downloadLaborComplaintDocx(payload) {
  return postDownloadBlob(
    "/documents/labor-complaint-docx",
    payload,
    "劳动保障监察投诉书_已填写.docx",
  );
}

export async function downloadCivilComplaintDocx(payload) {
  return postDownloadBlob(
    "/documents/civil-complaint-docx",
    payload,
    "民事起诉状_已填写.docx",
  );
}

export async function downloadEnforcementApplicationDocx(payload) {
  return postDownloadBlob(
    "/documents/enforcement-application-docx",
    payload,
    "申请执行书_已填写.docx",
  );
}

export async function downloadEvidenceListDocx(payload) {
  return postDownloadBlob("/documents/evidence-list-docx", payload, "证据材料清单_已填写.docx");
}

export async function downloadLaborArbitrationApplicationDocx(payload) {
  return postDownloadBlob(
    "/documents/labor-arbitration-application-docx",
    payload,
    "劳动人事争议仲裁申请书_已填写.docx",
  );
}

export async function downloadLaborMediationApplicationDocx(payload) {
  return postDownloadBlob(
    "/documents/labor-mediation-application-docx",
    payload,
    "劳动争议调解申请书_已填写.docx",
  );
}

export async function getCase(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}`);
}

export async function updateCase(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    body: payload || {},
  });
}

export async function createCase(payload) {
  return request("/cases", {
    method: "POST",
    body: payload,
  });
}

export async function listCaseEvidence(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}/evidence`);
}

export async function listCaseEvidenceRevisions(caseId, evidenceId) {
  return request(`/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/revisions`);
}

/** 婵犵數鍋為崹鍫曞箰閹间緡鏁勯柛顐ｇ贩瑜版帒鐐婃い鎺嗗亾闁哄绶氶幃妤€鈽夊▎娆庣返闂佽　鍋撻柟鎯板Г閸嬶綁鏌涢妷顖氼洭闁告柨绉堕埀顒冾潐閹搁绮堟笟鈧俊鎾箳濡も偓瀹告繃銇勯幘璺轰户妞?CSV闂傚倷鐒︾€笛呯矙閹存繐鑰跨紒鍌樷偓?8闂傚倷鐒︾€笛呯矙閹达附鍤愭い鏍仜缁?BOM闂傚倷鐒︾€笛呯矙閹寸偟闄勯柡鍐ㄥ€婚惌姘舵煠閸濄儲鏆╂い?Excel闂傚倷鐒︾€笛呯矙閹次诲洭顢橀姀鐘靛姦?*/
export async function downloadCaseEvidenceCsv(caseId) {
  return downloadBlob(`/cases/${encodeURIComponent(caseId)}/evidence/export.csv`, "闂備浇宕垫慨鏉懨洪敐澶嬪€块柨鏇楀亾闁伙絽鐏氶幏鍛村箹閻愨晛浜鹃柟鐑橆殔瀹告繃銇勯幘璺轰户妞?csv");
}

/** 闂傚倷鑳堕幊鎾绘倶濮樿泛绠伴柛婵勫劗閸嬫捇宕归鍡樺灩缁瑦寰勭仦绋夸壕闁挎繂楠搁獮妤冪磼娴ｅ嘲宓嗛柡灞诲妼閳藉鈻庨幋顓熸缂傚倷鐒﹂弻銊┾€﹀畡鎵殾?CSV + 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ鑲╁笡闁抽攱妫冮弻娑㈠即閵娿倗鍑瑰?+ 闂傚倷绀侀幉锟犳晪濠碘槅鍋呴〃澶愬Φ閹版澘閱囬柡鍥╁暱閹稿啴姊洪崨濠冨濞存粍绻堥、鏇熺鐎ｎ偆鍘藉┑掳鍊愰崑鎾绘煟濡も偓閿曘倝鏁?+ 婵犵數鍎戠徊钘壝归崒鐐茬獥婵炴垯鍩勯弫鍥煕閿旇骞楀┑顖氥偢閺屸剝寰勬惔銏€婄紓浣割槸濞硷繝骞冪捄琛℃闁哄诞鍏锯晠姊?*/
export async function downloadCaseEvidenceZip(caseId) {
  return downloadBlob(`/cases/${encodeURIComponent(caseId)}/evidence/export.zip`, "闂備浇宕垫慨鏉懨洪敐澶嬪€块柨鏇楀亾闁伙絽鐏氱粭鐔煎焵椤掆偓椤曪綁宕奸弴鐐电杸濡炪倖鎸鹃崰鎾寸?zip");
}

/** 闂傚倷绀侀幉锟犳嚌妤ｅ啫瀚夋い鎺戝閺佸棝鏌ｉ幇顒佹儓缂佺姰鍎查妵鍕箛閸撲礁鍩屾繛瀵稿帶鐎涒晜绌辨繝鍋芥棃鍩€椤掑嫭鍋嬮柛娑卞幐閺嬪酣鏌曡箛銉х？闁崇粯妫冮獮鏍庨鈧埀顒侇殔鍗遍柛顐犲劜閻撴瑩鎮归崶锝傚亾閾忣偆浜梻浣藉瀹曠敻宕伴幇顒夌劷濠电姵鑹惧Λ姗€鏌熺粙鎸庢崳妞わ负鍎甸弻锝夋偐閸欏鐓戦梺缁樺釜缁犳垿鎮鹃崹顐ょ懝闁逞屽墮閻ｅ嘲螖閳ь剟鎮鹃悜钘夌倞妞ゆ巻鍋撻柛妯荤懅缁辨捇宕掑顒佹闂佺硶鏅涢敃锕€危閹邦兘鏋庨柟鎯х枃琚?neo4jd3 缂傚倸鍊搁崐鐑芥倿閿曞倸绠板┑鐘崇閸婂灚銇勯弽顐沪闁?*/
export async function fetchEvidenceGraph(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}/evidence-graph`);
}

export async function fetchCaseArchives(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}/archives`);
}

export async function importLaborerFromMe(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}/laborer/import-me`, {
    method: "POST",
    body: {},
  });
}

export async function createCaseLaborer(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}/laborer`, {
    method: "POST",
    body: payload || {},
  });
}

export async function updateCaseLaborer(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}/laborer`, {
    method: "PATCH",
    body: payload || {},
  });
}

export async function createCaseEmployer(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}/employer`, {
    method: "POST",
    body: payload || {},
  });
}

export async function updateCaseEmployer(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}/employer`, {
    method: "PATCH",
    body: payload || {},
  });
}

export async function addCaseEvidence(caseId, payload) {
  return request(`/cases/${encodeURIComponent(caseId)}/evidence`, {
    method: "POST",
    body: payload || {},
  });
}

export async function updateCaseEvidence(caseId, evidenceId, payload) {
  const path = `/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}`;
  // Keep POST here to stay compatible with the backend route and existing CORS behavior.
  return request(path, {
    method: "POST",
    body: payload || {},
  });
}

/**
 * 婵犵數鍋為崹鍫曞箰閹间焦鏅濋柨婵嗘处椤洟鏌涢幘鑼妽閻庢碍鑹鹃湁闁挎繂娲﹂崵鈧紓浣风筏缁犳捇寮婚敓鐘茬＜婵﹩鍘鹃悡鎴濃攽閻愬弶顥撻柛銊ょ矙閹即顢氶埀顒€鐣峰鍕閻熸瑥瀚蹇涙⒑閼姐倕孝婵炶缍侀幃鐐烘晝閳ь剟鎮鹃崹顐ｅ闁革富鍘搁弸鏍⒑鐟欏嫬绀冮柛鈺傜墵瀵疇绠涢幙鍐數闂佸壊鍋勫Λ妤佸垔椤撶喓鐟归柍褜鍓欓悾鐑藉捶椤撴稑浜鹃柨婵嗛鐢劑鏌熼悜姗嗘當闁告垹濞€閺岀喖鏌囬敃鈧晶顖炴煕婵犲嫭鏆柡灞剧洴楠炲洭顢橀悩鍐叉珣闂備礁鎲￠悷銉ノ涘┑鍡╁殨闁汇垹澹婇弫鍡椼€掑顒佸闁轰胶鏁婚弻锝夋偐閸欏鐓戦梺缁樺釜缁犳垿鎮鹃崹顐ｅ閻熸瑥瀚崝鍛存⒑閻熸壆浠㈤悗姘煎枤缁牓宕熼娑掓嫽闂佹悶鍎荤徊鑺ョ妤ｅ啯鍊甸柣鐔哄閸熺偤鏌ｉ幙鍕瘈闁糕斁鍋撳銈嗗坊閸嬫挻銇勯敂鍨祮闁靛棔绀侀濂稿幢濞嗘ɑ绁梺鑽ゅС缁€浣革耿鏉堚晝鐭嗛柛鈩冪⊕閻? * @param {File} file
 * @param {string} caseId
 */
export async function uploadEvidenceAnalyze(file, caseId) {
  const fd = new FormData();
  fd.append("file", file);
  return request(`/cases/${encodeURIComponent(caseId)}/evidence/upload-analyze`, {
    method: "POST",
    body: fd,
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
}

export async function uploadEvidenceOcr(file, options = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (options.caseId) {
    fd.append("case_id", String(options.caseId));
  }
  if (options.persist) {
    fd.append("persist", "1");
  }
  return request("/evidence/ocr", {
    method: "POST",
    body: fd,
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
}

export async function uploadEvidenceFile(evidenceId, file) {
  const fd = new FormData();
  fd.append("file", file);
  return request(`/evidence/${encodeURIComponent(evidenceId)}/file`, {
    method: "POST",
    body: fd,
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
}

export async function reanalyzeEvidenceFile(evidenceId, file) {
  const fd = new FormData();
  fd.append("file", file);
  return request(`/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {
    method: "POST",
    body: fd,
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
}

export function buildEvidenceFileUrl(evidenceId) {
  return buildApiUrl(`/evidence/${encodeURIComponent(evidenceId)}/file`);
}

export async function fetchEvidenceFileBlob(evidenceId) {
  const { blob, contentType } = await request(`/evidence/${encodeURIComponent(evidenceId)}/file`, {
    responseType: "blob",
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
  });
  return { blob, contentType };
}

export async function fetchEvidenceFileBlobByFileId(evidenceId, fileId) {
  const { blob, contentType } = await request(`/evidence/${encodeURIComponent(evidenceId)}/file`, {
    responseType: "blob",
    timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
    query: { file_id: fileId },
  });
  return { blob, contentType };
}

export async function listEvidenceFiles(evidenceId) {
  return request(`/evidence/${encodeURIComponent(evidenceId)}/files`);
}

export async function fetchEvidenceRevisionFileBlob(evidenceId, revisionId) {
  const { blob, contentType } = await request(
    `/evidence/${encodeURIComponent(evidenceId)}/revisions/${encodeURIComponent(revisionId)}/file`,
    {
      responseType: "blob",
      timeoutMs: LARGE_TRANSFER_TIMEOUT_MS,
    },
  );
  return { blob, contentType };
}

export async function listPublicConsults(params = {}) {
  return request("/public-consults", {
    query: {
      keyword: params.keyword,
      type: params.type,
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    },
  });
}

export async function getPublicConsultDetail(pkid) {
  return request(`/public-consults/${encodeURIComponent(pkid)}`);
}

export async function listConsultFaqs(params = {}) {
  return request("/consult-faqs", {
    query: {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      keyword: params.keyword,
    },
  });
}
