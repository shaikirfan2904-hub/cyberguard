 /**
  * CyberGuard AI — Notifications JS
  * Handles notification panel, badges,
  * notification loading and real-time updates.
  */

const Notifications = (function () {
    'use strict';

    let notifications = [];
    let panelOpen = false;
    let initialized = false;
    let loading = false;


    /* =========================================================
       LOAD NOTIFICATIONS
    ========================================================= */

    async function load() {
        if (loading) {
            return;
        }

        loading = true;

        try {
            const response =
                await CyberGuardApp.api('/api/notifications');

            if (!response.success) {
                console.warn(
                    '[Notifications] Load failed:',
                    response.message
                );

                updateBadge();
                return;
            }

            notifications = Array.isArray(response.data)
                ? response.data
                : [];

            render();
            updateBadge();

        } catch (error) {
            console.error(
                '[Notifications] Load error:',
                error
            );

        } finally {
            loading = false;
        }
    }


    /* =========================================================
       RENDER
    ========================================================= */

    function render() {
        const list =
            document.getElementById('notificationList');

        if (!list) {
            return;
        }

        list.innerHTML = '';

        if (!notifications.length) {
            const empty =
                document.createElement('div');

            empty.className =
                'empty-state empty-state--sm';

            const text =
                document.createElement('p');

            text.textContent =
                'No notifications yet.';

            empty.appendChild(text);
            list.appendChild(empty);

            return;
        }

        const fragment =
            document.createDocumentFragment();

        notifications.forEach(function (notification) {

            if (!notification) {
                return;
            }

            const item =
                document.createElement('div');

            item.className =
                'notification-item';

            if (!notification.is_read) {
                item.classList.add('unread');
            }

            item.dataset.id =
                String(notification.id || '');

            const title =
                document.createElement('div');

            title.className =
                'notification-item-title';

            title.textContent =
                notification.title || 'Notification';

            const message =
                document.createElement('div');

            message.className =
                'notification-item-text';

            message.textContent =
                notification.message || '';

            const time =
                document.createElement('div');

            time.className =
                'notification-item-time';

            time.textContent =
                CyberGuardApp.formatTime(
                    notification.created_at
                );

            item.appendChild(title);
            item.appendChild(message);
            item.appendChild(time);

            fragment.appendChild(item);
        });

        list.appendChild(fragment);
    }


    /* =========================================================
       BADGES
    ========================================================= */

    function updateBadge() {
        const unread =
            notifications.filter(function (notification) {
                return notification &&
                    !notification.is_read;
            }).length;

        const badgeIds = [
            'topbarNotifBadge'
        ];

        badgeIds.forEach(function (id) {

            const element =
                document.getElementById(id);

            if (!element) {
                return;
            }

            if (unread > 0) {

                element.textContent =
                    unread > 9 ? '9+' : String(unread);

                element.style.display =
                    'inline-flex';

            } else {

                element.textContent = '';

                element.style.display =
                    'none';
            }
        });
    }


    /* =========================================================
       MARK SINGLE NOTIFICATION READ
    ========================================================= */

    async function markRead(id) {
        const notificationId =
            Number.parseInt(id, 10);

        if (!Number.isInteger(notificationId) ||
            notificationId <= 0) {
            return;
        }

        const notification =
            notifications.find(function (item) {
                return Number(item.id) === notificationId;
            });

        if (!notification || notification.is_read) {
            return;
        }

        try {
            const response =
                await CyberGuardApp.api(
                    '/api/notifications/' +
                    notificationId +
                    '/read',
                    {
                        method: 'POST'
                    }
                );

            if (!response.success) {
                CyberGuardApp.toast(
                    response.message ||
                    'Could not mark notification as read.',
                    'error'
                );

                return;
            }

            notification.is_read = true;

            render();
            updateBadge();

        } catch (error) {
            console.error(
                '[Notifications] Mark read error:',
                error
            );
        }
    }


    /* =========================================================
       MARK ALL READ
    ========================================================= */

    async function markAllRead() {
        const unreadCount =
            notifications.filter(function (item) {
                return item && !item.is_read;
            }).length;

        if (unreadCount === 0) {
            return;
        }

        try {
            const response =
                await CyberGuardApp.api(
                    '/api/notifications/read-all',
                    {
                        method: 'POST'
                    }
                );

            if (!response.success) {
                CyberGuardApp.toast(
                    response.message ||
                    'Could not update notifications.',
                    'error'
                );

                return;
            }

            notifications.forEach(
                function (notification) {
                    if (notification) {
                        notification.is_read = true;
                    }
                }
            );

            render();
            updateBadge();

            CyberGuardApp.toast(
                'All notifications marked as read',
                'success'
            );

        } catch (error) {
            console.error(
                '[Notifications] Mark all read error:',
                error
            );
        }
    }

    async function clearAll() {
        try {
            const response = await CyberGuardApp.api(
                '/api/notifications',
                { method: 'DELETE' }
            );
            if (!response || !response.success) {
                CyberGuardApp.toast(
                    response && response.message || 'Could not clear notifications.',
                    'error'
                );
                return;
            }
            notifications = [];
            render();
            updateBadge();
            CyberGuardApp.toast('Notifications cleared', 'success');
        } catch (error) {
            console.error('[Notifications] Clear error:', error);
            CyberGuardApp.toast('Could not clear notifications.', 'error');
        }
    }


    /* =========================================================
       PANEL
    ========================================================= */

    function togglePanel(forceState) {
        const panel =
            document.getElementById(
                'notificationPanel'
            );

        if (!panel) {
            return;
        }

        if (typeof forceState === 'boolean') {
            panelOpen = forceState;
        } else {
            panelOpen = !panelOpen;
        }

        panel.classList.toggle(
            'active',
            panelOpen
        );

        panel.setAttribute(
            'aria-hidden',
            panelOpen ? 'false' : 'true'
        );
    }


    /* =========================================================
       REAL-TIME ADD
    ========================================================= */

    function add(notification) {
        if (!notification ||
            typeof notification !== 'object') {
            return;
        }

        /*
         * Prevent duplicates when the same notification
         * arrives through Socket.IO and is also returned
         * by the API.
         */
        if (
            notification.id !== undefined &&
            notifications.some(function (item) {
                return Number(item.id) ===
                    Number(notification.id);
            })
        ) {
            return;
        }

        notifications.unshift(notification);

        /*
         * Keep the client-side list reasonably small.
         * The server remains the source of truth.
         */
        if (notifications.length > 100) {
            notifications =
                notifications.slice(0, 100);
        }

        render();
        updateBadge();

        if (notification.title) {
            CyberGuardApp.toast(
                notification.title,
                'info'
            );
        }
    }


    /* =========================================================
       EVENT HANDLERS
    ========================================================= */

    function handleNotificationClick(event) {
        const item =
            event.target.closest(
                '.notification-item'
            );

        if (!item) {
            return;
        }

        const id =
            item.dataset.id;

        markRead(id);
    }


    function handleOutsideClick(event) {
        if (!panelOpen) {
            return;
        }

        const panel =
            document.getElementById(
                'notificationPanel'
            );

        const toggle =
            document.getElementById(
                'topbarNotif'
            );

        if (!panel) {
            return;
        }

        if (
            panel.contains(event.target) ||
            (toggle && toggle.contains(event.target))
        ) {
            return;
        }

        togglePanel(false);
    }


    /* =========================================================
       INITIALIZATION
    ========================================================= */

    function init() {
        if (initialized) {
            return;
        }

        initialized = true;

        const panel =
            document.getElementById(
                'notificationPanel'
            );

        const toggle =
            document.getElementById(
                'topbarNotif'
            );

        const markAll =
            document.getElementById(
                'markAllReadBtn'
            );

        const clearButton = document.getElementById('clearNotificationsBtn');
        const closeButton = document.getElementById('closeNotificationPanel');

        const list =
            document.getElementById(
                'notificationList'
            );

        if (toggle) {
            toggle.addEventListener(
                'click',
                function (event) {
                    event.stopPropagation();
                    togglePanel();
                }
            );
        }

        if (markAll) {
            markAll.addEventListener(
                'click',
                function (event) {
                    event.stopPropagation();
                    markAllRead();
                }
            );
        }

        if (clearButton) {
            clearButton.addEventListener('click', function (event) {
                event.stopPropagation();
                clearAll();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', function (event) {
                event.stopPropagation();
                togglePanel(false);
            });
        }

        if (list) {
            list.addEventListener(
                'click',
                handleNotificationClick
            );
        }

        if (panel) {
            panel.addEventListener(
                'click',
                function (event) {
                    /*
                     * Preserve existing overlay-close
                     * behavior if the panel itself is
                     * the clicked element.
                     */
                    if (event.target === panel) {
                        togglePanel(false);
                    }
                }
            );
        }

        document.addEventListener(
            'click',
            handleOutsideClick
        );

        load();
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    return {
        init: init,
        load: load,
        add: add,
        clearAll: clearAll,
        updateBadge: updateBadge
    };

})();


window.Notifications = Notifications;
