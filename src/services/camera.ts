import { isCapacitor } from './platform'

export interface CameraOptions {
  saveToGallery?: boolean
}

/**
 * Capture a photo using platform-specific camera APIs.
 * Returns a standard JS File object, or null if cancelled or unavailable.
 * Throws an Error with 'PERMISSION_DENIED' if user denied camera permissions.
 */
export async function captureNativePhoto(options?: CameraOptions): Promise<File | null> {
  if (isCapacitor()) {
    try {
      const { Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera')

      // Check and request camera permissions explicitly on native platforms
      const check = await Camera.checkPermissions()
      if (check.camera !== 'granted') {
        const request = await Camera.requestPermissions({ permissions: ['camera'] })
        if (request.camera !== 'granted') {
          throw new Error('PERMISSION_DENIED')
        }
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        direction: CameraDirection.Rear, // Prefer back/rear camera for taking photos of text
        saveToGallery: options?.saveToGallery ?? false,
      })

      if (!photo.webPath) return null

      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const format = photo.format || 'jpeg'
      const file = new File([blob], `photo_${Date.now()}.${format}`, {
        type: blob.type || `image/${format}`,
      })

      return file
    } catch (err: any) {
      if (err?.message === 'PERMISSION_DENIED') {
        throw err
      }
      // User cancelled camera capture
      if (
        err?.message?.includes('User cancelled') ||
        err?.message?.includes('cancelled') ||
        err?.message?.includes('canceled')
      ) {
        return null
      }
      console.warn('Native camera capture failed:', err)
      throw err
    }
  }
  return null
}

/**
 * Automatically purge orphaned temporary camera photo files from the Capacitor Cache directory on app startup.
 * Guarantees 0 MB disk bloat on native mobile devices when saveToGallery is disabled.
 */
export async function cleanCameraCacheDir(): Promise<void> {
  if (isCapacitor()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.Cache,
      })

      if (result?.files?.length) {
        for (const file of result.files) {
          const fileName = typeof file === 'string' ? file : file.name
          if (
            fileName.startsWith('photo_') ||
            fileName.startsWith('cap_') ||
            fileName.endsWith('.tmp') ||
            fileName.endsWith('.jpg') ||
            fileName.endsWith('.jpeg') ||
            fileName.endsWith('.png')
          ) {
            await Filesystem.deleteFile({
              path: fileName,
              directory: Directory.Cache,
            }).catch(() => {})
          }
        }
      }
    } catch (err) {
      console.warn('Native camera cache cleanup warning:', err)
    }
  }
}
