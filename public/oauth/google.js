// Google returns here after sign-in with the access token in the URL fragment. The fragment never reaches a
// server; it is handed to the Molt window through a same-origin channel (Google's sign-in page cuts
// window.opener), removed from the address bar and this window closes.
(function () {
  var fragment = window.location.hash.slice(1)
  history.replaceState(null, '', window.location.pathname)
  var message = { type: 'molt-google-oauth', fragment: fragment }
  try {
    var channel = new BroadcastChannel('molt-google-oauth')
    channel.postMessage(message)
    channel.close()
  } catch (error) {
    if (window.opener) window.opener.postMessage(message, window.location.origin)
  }
  document.getElementById('status').textContent = 'Listo. Puedes cerrar esta ventana.'
  setTimeout(function () { window.close() }, 300)
})()
