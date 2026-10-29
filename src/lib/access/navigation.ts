export function navigate(path: string, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}
