import { clearAuthSession, getCurrentUser, setCurrentUser } from "./auth.js";
import {
  changePassword,
  getCurrentProfile,
  logout,
  resetPassword,
  updateProfile,
} from "./api.js";
import { setupProtectedPage } from "./page-auth.js";
import { AREAS } from "./china-areas.js";

const TEXT = {
  user: "\u7528\u6237",
  empty: "\u672a\u586b\u5199",
  loginPage: "./login.html",
  completionLow: "\u5f85\u5b8c\u5584",
  completionMid: "\u7ee7\u7eed\u5b8c\u5584",
  completionHigh: "\u8d44\u6599\u5b8c\u6574",
  completionLowHint: "\u7ee7\u7eed\u5b8c\u5584\u8054\u7cfb\u65b9\u5f0f\u4e0e\u8eab\u4efd\u4fe1\u606f\u3002",
  completionMidHint: "\u518d\u8865\u5145\u51e0\u9879\u4fe1\u606f\uff0c\u540e\u7eed\u8054\u7cfb\u548c\u8eab\u4efd\u6838\u9a8c\u4f1a\u66f4\u65b9\u4fbf\u3002",
  completionHighHint: "\u8d44\u6599\u5df2\u7ecf\u6bd4\u8f83\u5b8c\u6574\uff0c\u53ef\u4ee5\u76f4\u63a5\u7ba1\u7406\u8d26\u53f7\u5b89\u5168\u8bbe\u7f6e\u3002",
  syncOk: "\u5df2\u540c\u6b65\u6700\u65b0\u8d44\u6599\u3002",
  profileLoadFailed: "\u83b7\u53d6\u4e2a\u4eba\u8d44\u6599\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  saveOk: "\u4e2a\u4eba\u8d44\u6599\u5df2\u4fdd\u5b58\u3002",
  saveFailed: "\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  changePasswordOk: "\u5bc6\u7801\u4fee\u6539\u6210\u529f\u3002",
  changePasswordFailed: "\u4fee\u6539\u5bc6\u7801\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  resetPasswordOk: "\u5bc6\u7801\u91cd\u7f6e\u6210\u529f\u3002",
  resetPasswordFailed: "\u91cd\u7f6e\u5bc6\u7801\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  fillAllPasswords: "\u8bf7\u5b8c\u6574\u586b\u5199\u6240\u6709\u5bc6\u7801\u9879\u3002",
  fillResetFields: "\u8bf7\u5b8c\u6574\u586b\u5199\u91cd\u7f6e\u5bc6\u7801\u6240\u9700\u4fe1\u606f\u3002",
  passwordShort: "\u65b0\u5bc6\u7801\u81f3\u5c116\u4f4d\u3002",
  passwordMismatch: "\u4e24\u6b21\u8f93\u5165\u7684\u65b0\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002",
  saveLoading: "\u4fdd\u5b58\u4e2d...",
  logoutLoading: "\u9000\u51fa\u4e2d...",
  changePasswordLoading: "\u4fee\u6539\u4e2d...",
  resetPasswordLoading: "\u91cd\u7f6e\u4e2d...",
  welcome: "\u4f60\u597d\uff0c{name}\uff0c\u4f60\u53ef\u4ee5\u5728\u8fd9\u91cc\u7ba1\u7406\u4e2a\u4eba\u8d44\u6599\u548c\u8d26\u53f7\u5b89\u5168\u3002",
  navWelcome: "\u4f60\u597d\uff0c{name}",
  invalidPhone: "\u8bf7\u8f93\u516511\u4f4d\u624b\u673a\u53f7",
  invalidEmail: "\u8bf7\u8f93\u5165\u6b63\u786e\u7684\u90ae\u7bb1\u5730\u5740",
  invalidIdCard: "\u8bf7\u8f93\u516518\u4f4d\u8eab\u4efd\u8bc1\u53f7",
  nameRequired: "\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a",
  contactRequired: "\u624b\u673a\u53f7\u548c\u90ae\u7bb1\u81f3\u5c11\u586b\u5199\u4e00\u9879",
  currentPasswordRequired: "\u8bf7\u5b8c\u6574\u586b\u5199\u5f53\u524d\u5bc6\u7801\u548c\u65b0\u5bc6\u7801",
};

setupProtectedPage({ welcomeEl: "mainUserWelcome", logoutEl: null, fallbackName: TEXT.user });

const profileAvatar = document.getElementById("profileAvatar");
const profileName = document.getElementById("profileName");
const profileWelcome = document.getElementById("profileWelcome");
const profileCompletionCount = document.getElementById("profileCompletionCount");
const profileCompletionHint = document.getElementById("profileCompletionHint");
const profileBoundContact = document.getElementById("profileBoundContact");
const profileStatusTag = document.getElementById("profileStatusTag");

const profileInfoName = document.getElementById("profileInfoName");
const profileInfoGender = document.getElementById("profileInfoGender");
const profileInfoPhone = document.getElementById("profileInfoPhone");
const profileInfoEmail = document.getElementById("profileInfoEmail");
const profileInfoIdCard = document.getElementById("profileInfoIdCard");
const profileInfoRegion = document.getElementById("profileInfoRegion");
const profileInfoAddress = document.getElementById("profileInfoAddress");
const profileInfoOccupation = document.getElementById("profileInfoOccupation");
const profileInfoSchool = document.getElementById("profileInfoSchool");
const profileInfoType = document.getElementById("profileInfoType");

const profileForm = document.getElementById("profileForm");
const profileNameInput = document.getElementById("profileNameInput");
const profileGenderInput = document.getElementById("profileGenderInput");
const profilePhoneInput = document.getElementById("profilePhoneInput");
const profileEmailInput = document.getElementById("profileEmailInput");
const profileIdCardInput = document.getElementById("profileIdCardInput");
const profileOccupationInput = document.getElementById("profileOccupationInput");
const profileSchoolInput = document.getElementById("profileSchoolInput");
const profileProvinceInput = document.getElementById("profileProvinceInput");
const profileCityInput = document.getElementById("profileCityInput");
const profileDistrictInput = document.getElementById("profileDistrictInput");
const profileHomeAddressInput = document.getElementById("profileHomeAddressInput");
const profileFormMessage = document.getElementById("profileFormMessage");
const profileSaveBtn = document.getElementById("profileSaveBtn");

const changePasswordForm = document.getElementById("changePasswordForm");
const changePasswordOld = document.getElementById("changePasswordOld");
const changePasswordNew = document.getElementById("changePasswordNew");
const changePasswordConfirm = document.getElementById("changePasswordConfirm");
const changePasswordMessage = document.getElementById("changePasswordMessage");
const changePasswordBtn = document.getElementById("changePasswordBtn");

const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordAccount = document.getElementById("resetPasswordAccount");
const resetPasswordIdCard = document.getElementById("resetPasswordIdCard");
const resetPasswordNew = document.getElementById("resetPasswordNew");
const resetPasswordConfirm = document.getElementById("resetPasswordConfirm");
const resetPasswordMessage = document.getElementById("resetPasswordMessage");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

const profileLogoutBtn = document.getElementById("profileLogoutBtn");
const navbarLogoutBtn = document.getElementById("mainLogoutBtn");

const state = {
  user: getCurrentUser() || {},
};

function t(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatValue(value, fallback = TEXT.empty) {
  const text = normalizeText(value);
  return text || fallback;
}

function maskPhone(phone) {
  const text = normalizeText(phone);
  if (!text) return TEXT.empty;
  if (text.length < 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function maskIdCard(idCard) {
  const text = normalizeText(idCard).toUpperCase();
  if (!text) return TEXT.empty;
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}**********${text.slice(-4)}`;
}

function roleLabel(role) {
  switch (normalizeText(role)) {
    case "lawyer":
      return "\u6cd5\u5f8b\u987e\u95ee";
    case "admin":
      return "\u7ba1\u7406\u5458";
    default:
      return "\u4e2a\u4eba\u7528\u6237";
  }
}

function resolveBoundContact(user) {
  const parts = [normalizeText(user?.phone), normalizeText(user?.email)].filter(Boolean);
  return parts.length ? parts.join(" / ") : "\u672a\u7ed1\u5b9a";
}

function getCompletionCount(user) {
  const fields = [
    normalizeText(user?.name),
    normalizeText(user?.gender),
    normalizeText(user?.phone),
    normalizeText(user?.email),
    normalizeText(user?.id_card),
    normalizeText(user?.region),
    normalizeText(user?.home_addr),
    normalizeText(user?.occupation || user?.job),
    normalizeText(user?.school),
  ];
  return fields.filter(Boolean).length;
}

function completionStatusLabel(count) {
  if (count >= 8) return TEXT.completionHigh;
  if (count >= 5) return TEXT.completionMid;
  return TEXT.completionLow;
}

function completionHint(count) {
  if (count >= 8) return TEXT.completionHighHint;
  if (count >= 5) return TEXT.completionMidHint;
  return TEXT.completionLowHint;
}

function buildRegionFromSelect() {
  const province = normalizeText(profileProvinceInput?.value);
  const city = normalizeText(profileCityInput?.value);
  const district = normalizeText(profileDistrictInput?.value);
  const parts = [province, city, district].filter(Boolean);
  if (parts.length >= 2 && parts[0] === parts[1]) {
    parts.splice(1, 1);
  }
  return parts.join("");
}

function parseRegionSelection(rawRegion) {
  const raw = normalizeText(rawRegion);
  if (!raw) {
    return { province: "", city: "", district: "" };
  }

  for (const province of Object.keys(AREAS)) {
    if (!raw.includes(province)) continue;
    const citiesMap = AREAS[province] || {};
    for (const city of Object.keys(citiesMap)) {
      if (!raw.includes(city)) continue;
      const districts = Array.isArray(citiesMap[city]) ? citiesMap[city] : [];
      for (const district of districts) {
        if (raw.includes(district)) {
          return { province, city, district };
        }
      }
      return { province, city, district: "" };
    }
    return { province, city: "", district: "" };
  }

  return { province: "", city: "", district: "" };
}

function fillProvinceSelect() {
  if (!profileProvinceInput) return;
  profileProvinceInput.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "\u8bf7\u9009\u62e9\u7701\u4efd";
  profileProvinceInput.appendChild(placeholder);

  Object.keys(AREAS).forEach((province) => {
    const option = document.createElement("option");
    option.value = province;
    option.textContent = province;
    profileProvinceInput.appendChild(option);
  });
}

function fillCitySelect(province) {
  if (!profileCityInput) return;
  profileCityInput.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "\u8bf7\u9009\u62e9\u57ce\u5e02";
  profileCityInput.appendChild(placeholder);

  const cities = province && AREAS[province] ? Object.keys(AREAS[province]) : [];
  cities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    profileCityInput.appendChild(option);
  });
}

function fillDistrictSelect(province, city) {
  if (!profileDistrictInput) return;
  profileDistrictInput.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "\u8bf7\u9009\u62e9\u533a\u53bf";
  profileDistrictInput.appendChild(placeholder);

  const districts = province && city && AREAS[province] && Array.isArray(AREAS[province][city])
    ? AREAS[province][city]
    : [];

  districts.forEach((district) => {
    const option = document.createElement("option");
    option.value = district;
    option.textContent = district;
    profileDistrictInput.appendChild(option);
  });
}

function syncRegionSelectState() {
  const province = normalizeText(profileProvinceInput?.value);
  const city = normalizeText(profileCityInput?.value);
  if (profileCityInput) profileCityInput.disabled = !province;
  if (profileDistrictInput) profileDistrictInput.disabled = !province || !city;
}

function updateNavWelcome(name) {
  const mainUserWelcome = document.getElementById("mainUserWelcome");
  if (mainUserWelcome) {
    mainUserWelcome.textContent = t(TEXT.navWelcome, { name: name || TEXT.user });
  }
}

function setMessage(node, text = "", type = "info") {
  if (!node) return;
  node.textContent = text;
  node.classList.remove("is-success", "is-error", "is-info");
  if (!text) return;
  if (type === "success") node.classList.add("is-success");
  else if (type === "error") node.classList.add("is-error");
  else node.classList.add("is-info");
}

function setButtonBusy(button, busyText) {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }
  button.disabled = true;
  button.textContent = busyText;
}

function resetButton(button) {
  if (!button) return;
  button.disabled = false;
  if (button.dataset.defaultText) {
    button.textContent = button.dataset.defaultText;
  }
}

function renderProfile(user) {
  const nextUser = user || {};
  state.user = nextUser;

  const name = normalizeText(nextUser.name) || TEXT.user;
  const completionCount = getCompletionCount(nextUser);

  if (profileAvatar) profileAvatar.textContent = name.slice(0, 1).toUpperCase();
  if (profileName) profileName.textContent = name;
  if (profileWelcome) profileWelcome.textContent = t(TEXT.welcome, { name });

  if (profileCompletionCount) profileCompletionCount.textContent = `${completionCount} / 9`;
  if (profileCompletionHint) profileCompletionHint.textContent = completionHint(completionCount);
  if (profileBoundContact) profileBoundContact.textContent = resolveBoundContact(nextUser);
  if (profileStatusTag) profileStatusTag.textContent = completionStatusLabel(completionCount);

  if (profileInfoName) profileInfoName.textContent = formatValue(nextUser.name);
  if (profileInfoGender) profileInfoGender.textContent = formatValue(nextUser.gender);
  if (profileInfoPhone) profileInfoPhone.textContent = maskPhone(nextUser.phone);
  if (profileInfoEmail) profileInfoEmail.textContent = formatValue(nextUser.email);
  if (profileInfoIdCard) profileInfoIdCard.textContent = maskIdCard(nextUser.id_card);
  if (profileInfoRegion) profileInfoRegion.textContent = formatValue(nextUser.region);
  if (profileInfoAddress) profileInfoAddress.textContent = formatValue(nextUser.home_addr);
  if (profileInfoOccupation) profileInfoOccupation.textContent = formatValue(nextUser.occupation || nextUser.job);
  if (profileInfoSchool) profileInfoSchool.textContent = formatValue(nextUser.school);
  if (profileInfoType) profileInfoType.textContent = roleLabel(nextUser.role);

  updateNavWelcome(name);
}

function populateForm(user) {
  const nextUser = user || {};
  if (profileNameInput) profileNameInput.value = normalizeText(nextUser.name);
  if (profileGenderInput) profileGenderInput.value = normalizeText(nextUser.gender);
  if (profilePhoneInput) profilePhoneInput.value = normalizeText(nextUser.phone);
  if (profileEmailInput) profileEmailInput.value = normalizeText(nextUser.email);
  if (profileIdCardInput) profileIdCardInput.value = normalizeText(nextUser.id_card);
  if (profileOccupationInput) profileOccupationInput.value = normalizeText(nextUser.occupation || nextUser.job);
  if (profileSchoolInput) profileSchoolInput.value = normalizeText(nextUser.school);
  if (profileHomeAddressInput) profileHomeAddressInput.value = normalizeText(nextUser.home_addr);

  fillProvinceSelect();
  const parsedRegion = parseRegionSelection(nextUser.region);
  if (profileProvinceInput) profileProvinceInput.value = parsedRegion.province;
  fillCitySelect(parsedRegion.province);
  if (profileCityInput) profileCityInput.value = parsedRegion.city;
  fillDistrictSelect(parsedRegion.province, parsedRegion.city);
  if (profileDistrictInput) profileDistrictInput.value = parsedRegion.district;
  syncRegionSelectState();

  if (resetPasswordAccount) {
    resetPasswordAccount.value = normalizeText(nextUser.phone) || normalizeText(nextUser.email);
  }
  if (resetPasswordIdCard) {
    resetPasswordIdCard.value = normalizeText(nextUser.id_card);
  }
}

function handleAuthError(error) {
  const message = normalizeText(error?.message);
  if (!message) return false;
  if (!/(\u672a\u767b\u5f55|\u767b\u5f55|\u5931\u6548)/.test(message)) return false;
  clearAuthSession();
  window.location.replace(TEXT.loginPage);
  return true;
}

async function refreshProfile({ silent = false } = {}) {
  try {
    const result = await getCurrentProfile();
    const user = result?.user || {};
    setCurrentUser(user);
    renderProfile(user);
    populateForm(user);
    if (!silent) {
      setMessage(profileFormMessage, TEXT.syncOk, "info");
    }
    return user;
  } catch (error) {
    if (handleAuthError(error)) return null;

    const fallbackUser = getCurrentUser() || {};
    renderProfile(fallbackUser);
    populateForm(fallbackUser);
    if (!silent) {
      setMessage(profileFormMessage, error?.message || TEXT.profileLoadFailed, "error");
    }
    return fallbackUser;
  }
}

async function doLogout() {
  const buttons = [profileLogoutBtn, navbarLogoutBtn].filter(Boolean);
  buttons.forEach((button) => setButtonBusy(button, TEXT.logoutLoading));

  try {
    await logout();
  } catch (_error) {
    // Ignore logout API failures and clear local session anyway.
  } finally {
    clearAuthSession();
    window.location.replace(TEXT.loginPage);
  }
}

function validateProfilePayload(payload) {
  if (!payload.name) return TEXT.nameRequired;
  if (!payload.phone && !payload.email) return TEXT.contactRequired;
  if (payload.phone && !/^\d{11}$/.test(payload.phone)) return TEXT.invalidPhone;
  if (payload.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) return TEXT.invalidEmail;
  if (payload.id_card && !/^\d{17}[\dXx]$/.test(payload.id_card)) return TEXT.invalidIdCard;
  return "";
}

function collectProfilePayload() {
  return {
    name: normalizeText(profileNameInput?.value),
    gender: normalizeText(profileGenderInput?.value),
    phone: normalizeText(profilePhoneInput?.value),
    email: normalizeText(profileEmailInput?.value),
    id_card: normalizeText(profileIdCardInput?.value).toUpperCase(),
    region: buildRegionFromSelect(),
    home_addr: normalizeText(profileHomeAddressInput?.value),
    occupation: normalizeText(profileOccupationInput?.value),
    school: normalizeText(profileSchoolInput?.value),
  };
}

function bindRegionEvents() {
  if (profileProvinceInput) {
    profileProvinceInput.addEventListener("change", () => {
      const province = normalizeText(profileProvinceInput.value);
      fillCitySelect(province);
      if (profileCityInput) profileCityInput.value = "";
      fillDistrictSelect(province, "");
      if (profileDistrictInput) profileDistrictInput.value = "";
      syncRegionSelectState();
    });
  }

  if (profileCityInput) {
    profileCityInput.addEventListener("change", () => {
      const province = normalizeText(profileProvinceInput?.value);
      const city = normalizeText(profileCityInput.value);
      fillDistrictSelect(province, city);
      if (profileDistrictInput) profileDistrictInput.value = "";
      syncRegionSelectState();
    });
  }
}

if (profileForm) {
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(profileFormMessage, "", "info");

    const payload = collectProfilePayload();
    const validationMessage = validateProfilePayload(payload);
    if (validationMessage) {
      setMessage(profileFormMessage, validationMessage, "error");
      return;
    }

    setButtonBusy(profileSaveBtn, TEXT.saveLoading);
    try {
      const result = await updateProfile(payload);
      const user = result?.user || payload;
      setCurrentUser(user);
      renderProfile(user);
      populateForm(user);
      setMessage(profileFormMessage, result?.message || TEXT.saveOk, "success");
    } catch (error) {
      if (handleAuthError(error)) return;
      setMessage(profileFormMessage, error?.message || TEXT.saveFailed, "error");
    } finally {
      resetButton(profileSaveBtn);
    }
  });
}

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(changePasswordMessage, "", "info");

    const oldPassword = String(changePasswordOld?.value || "");
    const newPassword = String(changePasswordNew?.value || "");
    const confirmPassword = String(changePasswordConfirm?.value || "");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setMessage(changePasswordMessage, TEXT.fillAllPasswords, "error");
      return;
    }
    if (newPassword.length < 6) {
      setMessage(changePasswordMessage, TEXT.passwordShort, "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(changePasswordMessage, TEXT.passwordMismatch, "error");
      return;
    }

    setButtonBusy(changePasswordBtn, TEXT.changePasswordLoading);
    try {
      const result = await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      changePasswordForm.reset();
      setMessage(changePasswordMessage, result?.message || TEXT.changePasswordOk, "success");
    } catch (error) {
      if (handleAuthError(error)) return;
      setMessage(changePasswordMessage, error?.message || TEXT.changePasswordFailed, "error");
    } finally {
      resetButton(changePasswordBtn);
    }
  });
}

if (resetPasswordForm) {
  resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(resetPasswordMessage, "", "info");

    const account = normalizeText(resetPasswordAccount?.value);
    const idCard = normalizeText(resetPasswordIdCard?.value).toUpperCase();
    const newPassword = String(resetPasswordNew?.value || "");
    const confirmPassword = String(resetPasswordConfirm?.value || "");

    if (!account || !idCard || !newPassword || !confirmPassword) {
      setMessage(resetPasswordMessage, TEXT.fillResetFields, "error");
      return;
    }
    if (newPassword.length < 6) {
      setMessage(resetPasswordMessage, TEXT.passwordShort, "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(resetPasswordMessage, TEXT.passwordMismatch, "error");
      return;
    }

    setButtonBusy(resetPasswordBtn, TEXT.resetPasswordLoading);
    try {
      const result = await resetPassword({
        account,
        id_card: idCard,
        new_password: newPassword,
      });
      resetPasswordForm.reset();
      if (resetPasswordAccount) {
        resetPasswordAccount.value = normalizeText(state.user.phone) || normalizeText(state.user.email);
      }
      if (resetPasswordIdCard) {
        resetPasswordIdCard.value = normalizeText(state.user.id_card);
      }
      setMessage(resetPasswordMessage, result?.message || TEXT.resetPasswordOk, "success");
    } catch (error) {
      if (handleAuthError(error)) return;
      setMessage(resetPasswordMessage, error?.message || TEXT.resetPasswordFailed, "error");
    } finally {
      resetButton(resetPasswordBtn);
    }
  });
}

[profileLogoutBtn, navbarLogoutBtn].filter(Boolean).forEach((button) => {
  button.addEventListener("click", doLogout);
});

bindRegionEvents();
renderProfile(state.user);
populateForm(state.user);
refreshProfile({ silent: true });
