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

    static async requestPermission() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }

    static getPermissionState() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }

    static getNotificationIcon() {
        if (!this._iconPath) {
            this._iconPath = '/Noveo/ic_launcher.png';
            const probe = new Image();
            probe.onerror = () => { this._iconPath = '/Noveo/icon.png'; };
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
