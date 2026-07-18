export const authService = {
  getCurrentMockRole() {
    return "player";
  },
  signInMock(role) {
    return { role };
  },
  signOutMock() {
    return true;
  },
};
