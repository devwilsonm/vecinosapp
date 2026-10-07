// @ts-nocheck
export {};

const roleInfoModal = document.querySelector("#roleInfoModal");
const roleInfoOpen = document.querySelector("[data-role-info-open]");

if (roleInfoModal && roleInfoOpen) {
  const roleInfoDialog = roleInfoModal.querySelector("[role=dialog]");
  const roleInfoClose = roleInfoModal.querySelector("[data-role-info-close].role-info-close");
  let roleInfoPreviousFocus = null;

  const closeRoleInfo = () => {
    roleInfoModal.hidden = true;
    document.body.classList.remove("modal-open");
    roleInfoPreviousFocus?.focus();
  };

  const openRoleInfo = () => {
    roleInfoPreviousFocus = document.activeElement;
    roleInfoModal.hidden = false;
    document.body.classList.add("modal-open");
    roleInfoClose?.focus();
  };

  roleInfoOpen.addEventListener("click", openRoleInfo);
  roleInfoModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-role-info-close]")) closeRoleInfo();
  });
  roleInfoDialog?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRoleInfo();
  });
}