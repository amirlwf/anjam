const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('path')

const gotLock = app.requestSingleInstanceLock()
let win = null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, '..', 'dist', 'logo.png'),
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (url.startsWith('https:') || url.startsWith('http:')) shell.openExternal(url)
    }
  })

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.amirlwf.anjam')
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'File',
          submenu: [{ role: 'quit', label: 'Exit' }],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
      ])
    )
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
