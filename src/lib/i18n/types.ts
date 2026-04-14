export type Locale = "en" | "de";

export const LOCALES: Locale[] = ["en", "de"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export interface Translations {
  nav: {
    workspace: string;
    dashboard: string;
    projects: string;
    verzeichnis: string;
    upload: string;
    backups: string;
    files: string;
    admin: string;
    users: string;
    roles: string;
    modules: string;
    modulesSection: string;
    projectsSection: string;
    noProjects: string;
    soon: string;
  };
  auth: {
    login: {
      subtitle: string;
      usernameOrEmail: string;
      password: string;
      rememberMe: string;
      signIn: string;
      signingIn: string;
      backToHome: string;
    };
    setup: {
      title: string;
      description: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
      passwordHint: string;
      repeatPassword: string;
      createAccount: string;
      creatingAccount: string;
      checkingStatus: string;
    };
    unauthorized: {
      title: string;
      description: string;
      backHome: string;
    };
  };
  dashboard: {
    title: string;
    welcome: string;
    stats: {
      projects: string;
      servers: string;
      members: string;
      projectsDesc: string;
      serversDesc: string;
      membersDesc: string;
    };
    yourProjects: string;
    noProjects: string;
    noProjectsHint: string;
  };
  profile: {
    changePassword: string;
    changePasswordDesc: string;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    passwordMinChars: string;
    cancel: string;
    changePasswordBtn: string;
    changing: string;
    passwordChanged: string;
    passwordMismatch: string;
    passwordTooShort: string;
    failedToChange: string;
    logout: string;
    loggingOut: string;
  };
  admin: {
    title: string;
    subtitle: string;
    dashboard: {
      container: string;
      runningTotal: string;
      dockerDaemon: string;
      activeStreams: string;
      pendingOps: string;
      dockerStatus: string;
      daemon: string;
      circuitBreaker: string;
      daemonConnected: string;
      daemonDisconnected: string;
      daemonReconnecting: string;
      circuitClosed: string;
      circuitOpen: string;
      circuitHalfOpen: string;
      memory: string;
      memUsed: string;
      memFree: string;
      memTotal: string;
      noContainers: string;
      colName: string;
      colImage: string;
      colStatus: string;
      colCpu: string;
      colRam: string;
      colPorts: string;
    };
    users: {
      title: string;
      subtitle: string;
      createUser: string;
      createUserDesc: string;
      editUser: string;
      editUserDesc: string;
      deleteUser: string;
      deleteUserDesc: string;
      noUsers: string;
      username: string;
      email: string;
      password: string;
      passwordPlaceholder: string;
      enabled: string;
      roles: string;
      active: string;
      disabled: string;
      resetPassword: string;
      tempPassword: string;
      tempPasswordEmailSent: string;
      tempPasswordManual: string;
      creating: string;
      saving: string;
      saveChanges: string;
      cancel: string;
      delete: string;
    };
    roles: {
      title: string;
      subtitle: string;
      createRole: string;
      createRoleDesc: string;
      editRole: string;
      editRoleDesc: string;
      deleteRole: string;
      deleteRoleDesc: string;
      noRoles: string;
      name: string;
      description: string;
      descriptionPlaceholder: string;
      noDescription: string;
      permissionCount: string;
      creating: string;
      saving: string;
      saveChanges: string;
      cancel: string;
      delete: string;
    };
    modules: {
      title: string;
      subtitle: string;
      installed: string;
      catalog: string;
      available: string;
      install: string;
      installing: string;
      uninstall: string;
      uninstalling: string;
      start: string;
      stop: string;
      update: string;
      updating: string;
      noModules: string;
      confirmUninstall: string;
      confirmUninstallDesc: string;
      loadCatalogError: string;
      noCatalog: string;
      cancel: string;
    };
  };
  projects: {
    title: string;
    subtitle: string;
    noProjectsDesc: string;
    create: {
      trigger: string;
      title: string;
      description: string;
      name: string;
      namePlaceholder: string;
      key: string;
      keyPlaceholder: string;
      keyHint: string;
      creating: string;
      create: string;
      cancel: string;
    };
    validation: {
      nameRequired: string;
      nameMaxLength: string;
      keyRequired: string;
      keyMaxLength: string;
      keyFormat: string;
    };
    card: {
      noServers: string;
      more: string;
      open: string;
      startAll: string;
    };
    detail: {
      projectLabel: string;
      serversRunning: string;
    };
    delete: {
      sectionTitle: string;
      sectionDesc: string;
      sectionDescBlocked: string;
      deleteBtn: string;
      confirmTitle: string;
      confirmDesc: string;
      confirmHint: string;
      confirmNameLabel: string;
      deleting: string;
      deleteConfirm: string;
      cancel: string;
      success: string;
      error: string;
    };
    members: {
      title: string;
      invite: string;
      owner: string;
      noMembers: string;
      removeConfirm: string;
      removeConfirmDesc: string;
      remove: string;
      cancel: string;
      roles: {
        admin: string;
        editor: string;
        viewer: string;
      };
      serverAccess: string;
      noServerAccess: string;
    };
    servers: {
      title: string;
      noServers: string;
      addServer: string;
      blueprints: string;
      noBlueprints: string;
      deleteBlueprint: string;
      deleteBlueprintDesc: string;
      editBlueprint: string;
      cancel: string;
      delete: string;
      save: string;
    };
    blueprints: {
      create: string;
      createTitle: string;
      createDesc: string;
      claimed: string;
      available: string;
      maxRam: string;
    };
  };
  verzeichnis: {
    title: string;
    subtitle: string;
    upload: {
      title: string;
      description: string;
    };
    backups: {
      title: string;
      description: string;
    };
    files: {
      title: string;
      description: string;
    };
  };
  common: {
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    close: string;
    loading: string;
    error: string;
    saving: string;
    creating: string;
    unknown: string;
    language: string;
    switchLanguage: string;
  };
}
