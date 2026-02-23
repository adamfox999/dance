import '../components/toast/toast-notification'
import mascotSrc from '../components/toast/toast-mascot.svg'

let toastInstance = null

function getToastInstance() {
	if (typeof window === 'undefined') return null
	if (toastInstance) return toastInstance

	const factory = window.createToastNotification
	if (typeof factory !== 'function') return null

	toastInstance = factory({
		mascotSrc,
	})
	return toastInstance
}

export function notify(message, options = {}) {
	const text = String(message || '').trim()
	if (!text) return

	const instance = getToastInstance()
	if (!instance) {
		console.info(text)
		return
	}

	if (options.duration && Number(options.duration) > 0 && typeof window.createToastNotification === 'function') {
		window.createToastNotification({
			mascotSrc,
			duration: Number(options.duration),
		}).show(text)
		return
	}

	instance.show(text)
}
