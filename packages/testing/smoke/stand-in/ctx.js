/**
 * The cordis context the bundle is applied to: every service the skin reads
 * behind ctx.get, the disposer apply()'s effect hands back, and — for the cases
 * whose service mounts after this plugin — the inject the skin waits through.
 */
(function () {
  var host = window.__dshSmokeHost
  var CASE = host.CASE
  var forms = host.forms
  var account = host.account
  var permissionPresets = host.permissionPresets
  var remote = host.remote
  var sessions = host.sessions
  var workspacesService = host.workspacesService
  var deepy = host.deepy
  var turnNav = host.turnNav
  var waitChat = host.waitChat
  var localeService = host.localeService
  var slotRegistry = host.slotRegistry

  window.__permissionCommands = host.permissionCommands
  /**
   * The host's `theme` service, as far as the skin reads it: the sizes and
   * families it stores, the two writes, and `theme/change` as the listeners on
   * the service itself. The host keeps these in its settings document, so a
   * write answers the same way a stored value does — the value moves, then every
   * listener hears it.
   */
  var themeListeners = []
  var themeState = {
    fontSizes: { text: 14, code: 11, terminal: 13 },
    fontFamilies: { text: '', code: '', terminal: '' },
    revision: 0,
  }
  var themeService = {
    listeners: themeListeners,
    getTheme: function () { return themeState },
    setFontSize: function (role, px) {
      themeState.fontSizes[role] = px
      themeState.revision += 1
      for (var i = 0; i < themeListeners.length; i++) themeListeners[i]()
    },
    setFontFamily: function (role, value) {
      themeState.fontFamilies[role] = value
      themeState.revision += 1
      for (var i = 0; i < themeListeners.length; i++) themeListeners[i]()
    },
  }
  window.__dshSmokeHost.theme = themeService
  window.__ctx = {
    fiber: { entry: { id: 'ui-skin-claude-style' } },
    get: function (name) {
      if (name === 'configForms') return forms
      if (name === 'theme') return themeService
      if (name === 'remote.account') return account
      if (name === 'remote.permissionPresets') return permissionPresets
      if (name === 'remote') return CASE === 'desktop' || CASE === 'session-title' ? remote : undefined
      if (name === 'remote.session') return CASE === 'session-title' ? remote.session : undefined
      if (name === 'sessions') return sessions
      if (name === 'modelDirectories') return host.modelDirectories
      if (name === 'workspaces') return workspacesService
      if (name === 'uiConversation') return deepy !== undefined ? deepy.conversation : turnNav !== undefined ? turnNav.conversation : waitChat
      if (name === 'uiSession') return deepy !== undefined ? deepy.uiSession : CASE === 'session-title' ? { current: { value: { key: 'smoke-session' } } } : undefined
      if (name === 'locale') return localeService
      if (name === 'slots') return slotRegistry
      return undefined
    },
    effect: function (fn) { window.__dispose = fn() },
  }
  // The desktop account service mounts after this plugin does, so the skin waits
  // for it through ctx.inject; the studio case waits for the slot
  // registry the same way, the chunk-late case for the settings section's seats,
  // and the switch cases for the row-action seat their workspace delete action
  // registers into. The other cases keep no inject, which is what makes them
  // read synchronously at install (the install-fault case depends on that read
  // throwing).
  if (CASE === 'desktop' || CASE === 'studio' || CASE === 'settings' || CASE === 'chunk-late' || CASE === 'chat-files' || CASE === 'peer-chat-ux' || CASE === 'switches' || CASE === 'switches-off' || CASE === 'skin-center-handoff' || CASE === 'skin-center-arrival' || CASE === 'composer' || CASE === 'permissions-locale') {
    window.__ctx.inject = function (deps, cb) {
      var disposers = []
      cb({
        effect: function (fn) {
          var dispose = fn()
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        },
        get: function (name) { return window.__ctx.get(name) },
      })
      return {
        dispose: function () {
          for (var i = disposers.length - 1; i >= 0; i--) {
            try { disposers[i]() } catch (error) { /* already stopped */ }
          }
        },
      }
    }
  }
})()
