const unavailable = () => {
  throw new Error('Native API is unavailable in the browser extension')
}

export class WebPlugin {}
export const registerPlugin = () => ({})
export const invoke = unavailable
export const getCurrentWindow = unavailable
export const fetch = unavailable
export const check = unavailable
export const relaunch = unavailable
export const Device = { getInfo: unavailable }
export const Keyboard = { addListener: unavailable }
export const Preferences = { get: unavailable, set: unavailable }
export const Filesystem = {
  readdir: unavailable,
  deleteFile: unavailable,
  addListener: unavailable,
  downloadFile: unavailable,
  getUri: unavailable,
}
export const Directory = { Cache: 'CACHE' }
export const FileOpener = { openFile: unavailable }
export const Camera = { getPhoto: unavailable }
export const CameraResultType = {}
export const CameraSource = {}
export const CameraDirection = {}
export const CapacitorSQLite = {}
export class SQLiteConnection {}
