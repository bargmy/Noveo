class PushNotificationManager {
    static translate(key, fallback, replacements = {}) {
        const translator = globalThis.__noveoTranslate;
        if (typeof translator === 'function') return translator(key, fallback, replacements);
        let value = String(fallback ?? '');
        Object.entries(replacements || {}).forEach(([token, replacement]) => {
            value = value.replaceAll(`{${token}}`, String(replacement ?? ''));
        });
        return value;
    }

    static getServerUrl(path = '') {
        const base = String(globalThis.__noveoServerUrl || 'https://noveo.ir:8443').replace(/\/+$/, '');
        if (!path) return base;
        return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    }

    static getPermissionState() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }

    static supportsWebPush() {
        return Boolean(
            'serviceWorker' in navigator
            && 'PushManager' in window
            && 'Notification' in window
        );
    }

    static async ensureServiceWorker() {
        if (!this.supportsWebPush()) return null;
        if (!this._registrationPromise) {
            this._registrationPromise = navigator.serviceWorker.register('/service-worker.js?v=20260408_1', { scope: '/' })
                .then(() => navigator.serviceWorker.ready)
                .catch((error) => {
                    console.error('Service worker registration failed', error);
                    this._registrationPromise = null;
                    return null;
                });
        }
        return this._registrationPromise;
    }

    static async fetchPublicKey() {
        if (this._vapidPublicKey) return this._vapidPublicKey;
        const response = await fetch(this.getServerUrl('/push/public-key'), { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !result.publicKey) {
            throw new Error(result.error || 'Push public key unavailable.');
        }
        this._vapidPublicKey = result.publicKey;
        return this._vapidPublicKey;
    }

    static urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(normalized);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    }

    static async requestPermission(userId = '', token = '') {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'denied') return false;
        const permission = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
        if (permission !== 'granted') return false;
        if (userId && token) {
            await this.syncSubscription(userId, token);
        }
        return true;
    }

    static async syncSubscription(userId, token) {
        if (!userId || !token || this.getPermissionState() !== 'granted' || !this.supportsWebPush()) return false;
        const registration = await this.ensureServiceWorker();
        if (!registration) return false;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const publicKey = await this.fetchPublicKey();
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicKey),
            });
        }
        const response = await fetch(this.getServerUrl('/push/subscribe'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId,
                'X-Auth-Token': token,
            },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Could not register push subscription.');
        }
        return true;
    }

    static async detachSubscription(userId, token, unsubscribeBrowser = false) {
        if (!userId || !token || !this.supportsWebPush()) return false;
        const registration = await this.ensureServiceWorker();
        if (!registration) return false;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return false;
        const endpoint = subscription.endpoint || '';
        try {
            await fetch(this.getServerUrl('/push/unsubscribe'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId,
                    'X-Auth-Token': token,
                },
                body: JSON.stringify({ endpoint }),
            });
        } catch (error) {
            console.error('Push unsubscribe failed', error);
        }
        if (unsubscribeBrowser) {
            try {
                await subscription.unsubscribe();
            } catch (error) {
                console.error('Push browser unsubscribe failed', error);
            }
        }
        return true;
    }

    static getNotificationIcon() {
        if (!this._iconPath) {
            this._iconPath = '/ic_launcher.png';
            const probe = new Image();
            probe.onerror = () => { this._iconPath = '/icon.png'; };
            probe.src = this._iconPath;
        }
        return this._iconPath;
    }

    static notifyNewMessage(senderName, rawContent) {
        if (Notification.permission !== 'granted') return;

        let bodyText = this.translate('push.newMessage', 'New message');
        try {
            const data = (typeof rawContent === 'string') ? JSON.parse(rawContent) : rawContent;
            if (data.text) bodyText = data.text;
            else if (data.file) bodyText = this.translate('push.sentAttachment', 'Sent an attachment');
        } catch (e) {
            bodyText = String(rawContent || '').replace(/<[^>]*>/g, ' ').trim();
        }

        try {
            const notification = new Notification(this.translate('push.newMessageTitle', 'New message from {name}', { name: senderName }), {
                body: bodyText.substring(0, 100),
                icon: PushNotificationManager.getNotificationIcon(),
                tag: 'msg-' + Date.now()
            });
            notification.onclick = function () { window.focus(); notification.close(); };
        } catch (e) {
            console.error(e);
        }
    }
}

PushNotificationManager.getNotificationIcon();
PushNotificationManager.ensureServiceWorker().catch(() => {});
