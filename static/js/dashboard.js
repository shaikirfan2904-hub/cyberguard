/**
 * CyberGuard AI — Dashboard JS
 * Handles sidebar, user card, chat list, friend requests and search.
 */

const Dashboard = (function () {
    'use strict';

    let currentUser = null;
    let friends = [];
    let pendingRequests = [];
    let activeChatUser = null;

    let searchTimer = null;
    let renderVersion = 0;

    let socketHandlersInitialized = false;
    let uiHandlersInitialized = false;

    /* =========================================================
       INIT
       ========================================================= */

    async function init() {
        if (uiHandlersInitialized) return;

        uiHandlersInitialized = true;

        initSocketHandlers();
        initSearch();
        initTabs();
        initSidebarToggle();
        initNotificationToggle();

        /*
         * Load the authenticated user first.
         * The Socket.IO connection depends on the session.
         */
        const userLoaded = await loadCurrentUser();

        if (!userLoaded) {
            return;
        }

        /*
         * Start Socket.IO after authentication is confirmed.
         */
        CyberGuardSocket.connect();

        /*
         * Load dashboard data.
         */
        await Promise.all([
            loadFriends(),
            loadRequests()
        ]);

        /*
         * Initialize notifications after the dashboard
         * has been successfully loaded.
         */
        if (window.Notifications) {
            Notifications.init();
        }
    }

    /* =========================================================
       CURRENT USER
       ========================================================= */

    async function loadCurrentUser() {
        try {
            const res = await CyberGuardApp.api('/api/auth/me');

            if (!res || !res.success) {
                window.location.href = '/login';
                return false;
            }

            currentUser = res.data || null;

            if (!currentUser) {
                window.location.href = '/login';
                return false;
            }

            renderUserCard();

            return true;

        } catch (error) {
            console.error(
                '[Dashboard] Failed to load current user:',
                error
            );

            window.location.href = '/login';

            return false;
        }
    }

    function renderUserCard() {
        if (!currentUser) return;

        const avatar =
            document.getElementById('userAvatar');

        const name =
            document.getElementById('userDisplayName');

        const status =
            document.getElementById('userStatusText');

        if (avatar) {
            avatar.textContent =
                CyberGuardApp.getInitials(
                    currentUser.username
                );
        }

        if (name) {
            name.textContent =
                currentUser.display_name ||
                currentUser.username;
            if (currentUser.is_flagged) {
                name.textContent += ' ⚠ Abusive User';
                name.classList.add('user-name--flagged');
            }
        }

        if (status) {
            status.textContent = 'Online';
        }
    }

    /* =========================================================
       FRIENDS / CHAT LIST
       ========================================================= */

    async function loadFriends() {
        try {
            const res =
                await CyberGuardApp.api('/api/users');

            if (!res || !res.success) {
                friends = [];

                renderChatListError(
                    res && res.message
                        ? res.message
                        : 'Unable to load conversations.'
                );

                return;
            }

            friends = Array.isArray(res.data)
                ? res.data
                : [];

            await renderChatList();

        } catch (error) {
            console.error(
                '[Dashboard] Failed to load friends:',
                error
            );

            friends = [];

            renderChatListError(
                'Unable to load conversations.'
            );
        }
    }

    function renderChatListError(message) {
        const list =
            document.getElementById('chatList');

        if (!list) return;

        list.innerHTML =
            '<div class="empty-state empty-state--sm">' +
                '<p>' +
                    CyberGuardApp.escapeHtml(message) +
                '</p>' +
            '</div>';
    }

    async function renderChatList() {
        const list =
            document.getElementById('chatList');

        if (!list) return;

        const version = ++renderVersion;

        if (friends.length === 0) {
            list.innerHTML =
                '<div class="empty-state empty-state--sm">' +
                    '<svg viewBox="0 0 24 24" ' +
                    'fill="none" stroke="currentColor" ' +
                    'stroke-width="1.5">' +
                        '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>' +
                    '</svg>' +
                    '<p>Your conversations will appear here.</p>' +
                '</div>';

            return;
        }

        /*
         * Fetch last message + unread count for every friend.
         */
        const items = await Promise.all(
            friends.map(async function (friend) {

                const username =
                    friend.username;

                let lastMsg = null;
                let lastTime = '';
                let lastTimestamp = '';
                let unread = 0;

                try {
                    const messageRes =
                        await CyberGuardApp.api(
                            '/api/messages/' +
                            encodeURIComponent(username) +
                            '?page=1'
                        );

                    if (
                        messageRes &&
                        messageRes.success &&
                        Array.isArray(messageRes.data) &&
                        messageRes.data.length > 0
                    ) {
                        const messages =
                            messageRes.data;

                        lastMsg =
                            messages[messages.length - 1];

                        if (lastMsg) {
                            lastTimestamp = lastMsg.created_at || '';
                            lastTime =
                                CyberGuardApp.formatTime(
                                    lastMsg.created_at
                                );
                        }
                    }
                } catch (error) {
                    console.error(
                        '[Dashboard] Message preview error:',
                        error
                    );
                }

                try {
                    const unreadRes =
                        await CyberGuardApp.api(
                            '/api/messages/' +
                            encodeURIComponent(username) +
                            '/unread-count'
                        );

                    if (
                        unreadRes &&
                        unreadRes.success &&
                        unreadRes.data
                    ) {
                        unread =
                            Number(
                                unreadRes.data.count
                            ) || 0;
                    }
                } catch (error) {
                    console.error(
                        '[Dashboard] Unread count error:',
                        error
                    );
                }

                return {
                    username: username,

                    display_name:
                        friend.display_name ||
                        username,

                    status:
                        friend.status || 'offline',

                    last_seen:
                        friend.last_seen || null,

                    lastMsg:
                        lastMsg &&
                        typeof lastMsg.message === 'string'
                            ? lastMsg.message
                            : '',

                    lastTime: lastTime,
                    lastTimestamp: lastTimestamp,

                    unread: unread
                };
            })
        );

        /*
         * Ignore an old render if another refresh started
         * while these API requests were running.
         */
        if (version !== renderVersion) {
            return;
        }

        /*
         * Most recent conversations first.
         * Conversations without messages remain at the bottom.
         */
        items.sort(function (a, b) {
            if (!a.lastMsg && !b.lastMsg) {
                return a.display_name.localeCompare(
                    b.display_name
                );
            }

            if (!a.lastMsg) return 1;
            if (!b.lastMsg) return -1;

            return (Date.parse(b.lastTimestamp) || 0) -
                (Date.parse(a.lastTimestamp) || 0);
        });

        list.innerHTML = items.map(function (item) {

            const isActive =
                activeChatUser === item.username;

            const online =
                item.status === 'online';

            const initial =
                CyberGuardApp.getInitials(
                    item.username
                );

            const lastMsgText =
                item.lastMsg
                    ? CyberGuardApp.escapeHtml(
                        item.lastMsg.substring(0, 40)
                    )
                    : 'No messages yet';

            const flaggedBadge = item.is_flagged
                ? '<span class="abusive-user-badge">⚠ Abusive User</span>'
                : '';

            const unreadBadge =
                item.unread > 0
                    ? '<span class="unread-badge">' +
                        item.unread +
                      '</span>'
                    : '';

            const time =
                item.lastTime
                    ? '<span class="chat-list-time">' +
                        CyberGuardApp.escapeHtml(
                            item.lastTime
                        ) +
                      '</span>'
                    : '';

            return (
                '<div class="chat-list-item' +
                    (isActive ? ' active' : '') +
                    '"' +
                    ' data-username="' +
                    CyberGuardApp.escapeHtml(
                        item.username
                    ) +
                    '">' +

                    '<div class="chat-list-avatar">' +
                        initial +
                        '<span class="status-dot status-dot--' +
                            (online
                                ? 'online'
                                : 'offline') +
                        '"></span>' +
                    '</div>' +

                    '<div class="chat-list-info">' +

                        '<div class="chat-list-name">' +
                            CyberGuardApp.escapeHtml(
                                item.display_name
                            ) +
                            flaggedBadge +
                        '</div>' +

                        '<div class="chat-list-last">' +
                            lastMsgText +
                        '</div>' +

                    '</div>' +

                    '<div class="chat-list-meta">' +
                        time +
                        unreadBadge +
                    '</div>' +

                '</div>'
            );

        }).join('');

        list.querySelectorAll(
            '.chat-list-item'
        ).forEach(function (item) {

            item.addEventListener(
                'click',
                function () {
                    openChat(
                        this.dataset.username
                    );
                }
            );
        });
    }

    /* =========================================================
       FRIEND REQUESTS
       ========================================================= */

    async function loadRequests() {
        try {
            const res =
                await CyberGuardApp.api(
                    '/api/friends/requests'
                );

            if (!res || !res.success) {
                pendingRequests = [];
                renderRequests();
                updateRequestBadge();
                return;
            }

            pendingRequests =
                Array.isArray(res.data)
                    ? res.data
                    : [];

            renderRequests();
            updateRequestBadge();

        } catch (error) {
            console.error(
                '[Dashboard] Failed to load requests:',
                error
            );
        }
    }

    function renderRequests() {
        const list =
            document.getElementById('requestList');

        if (!list) return;

        if (pendingRequests.length === 0) {
            list.innerHTML =
                '<div class="empty-state empty-state--sm">' +
                    '<svg viewBox="0 0 24 24" ' +
                    'fill="none" stroke="currentColor" ' +
                    'stroke-width="1.5">' +
                        '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>' +
                        '<circle cx="9" cy="7" r="4"/>' +
                    '</svg>' +
                    '<p>No pending friend requests.</p>' +
                '</div>';

            return;
        }

        list.innerHTML =
            pendingRequests.map(function (request) {

                const showSafetyWarning = request.sender_flagged ||
                    (currentUser && currentUser.is_flagged);
                const warningText = request.sender_flagged
                    ? '@' + request.sender + ' is flagged as an Abusive User. Review this request carefully.'
                    : 'Your account is flagged as an Abusive User. Review this request carefully.';

                return (
                    '<div class="request-item" ' +
                        'data-id="' +
                        CyberGuardApp.escapeHtml(
                            request.id
                        ) +
                    '">' +

                        '<div class="chat-list-avatar">' +
                            CyberGuardApp.getInitials(
                                request.sender
                            ) +
                        '</div>' +

                        '<div class="request-info">' +

                            '<div class="request-name">' +
                                CyberGuardApp.escapeHtml(
                                    request.sender_display ||
                                    request.sender
                                ) +
                            '</div>' +

                            '<div class="request-text">@' +
                                CyberGuardApp.escapeHtml(
                                    request.sender
                                ) +
                            '</div>' +

                            (showSafetyWarning
                                ? '<div class="safety-warning-card">⚠ ' +
                                    CyberGuardApp.escapeHtml(warningText) +
                                  '</div>'
                                : '') +

                        '</div>' +

                        '<div class="request-actions">' +

                            '<button ' +
                                'class="request-btn request-btn--accept" ' +
                                'data-action="accept" ' +
                                'data-id="' +
                                CyberGuardApp.escapeHtml(
                                    request.id
                                ) +
                                '" ' +
                                'aria-label="Accept">' +

                                '<svg viewBox="0 0 24 24" ' +
                                'fill="none" ' +
                                'stroke="currentColor" ' +
                                'stroke-width="2">' +
                                    '<polyline points="20 6 9 17 4 12"/>' +
                                '</svg>' +

                            '</button>' +

                            '<button ' +
                                'class="request-btn request-btn--reject" ' +
                                'data-action="reject" ' +
                                'data-id="' +
                                CyberGuardApp.escapeHtml(
                                    request.id
                                ) +
                                '" ' +
                                'aria-label="Reject">' +

                                '<svg viewBox="0 0 24 24" ' +
                                'fill="none" ' +
                                'stroke="currentColor" ' +
                                'stroke-width="2">' +
                                    '<line x1="18" y1="6" x2="6" y2="18"/>' +
                                    '<line x1="6" y1="6" x2="18" y2="18"/>' +
                                '</svg>' +

                            '</button>' +

                        '</div>' +

                    '</div>'
                );

            }).join('');

        list.querySelectorAll(
            '.request-btn'
        ).forEach(function (button) {

            button.addEventListener(
                'click',
                async function () {

                    const action =
                        this.dataset.action;

                    const id =
                        this.dataset.id;

                    if (!action || !id) {
                        return;
                    }

                    if (this.disabled) {
                        return;
                    }

                    const requested = pendingRequests.find(function (item) {
                        return String(item.id) === String(id);
                    });
                    const flaggedParticipant = (requested && requested.sender_flagged) ||
                        (currentUser && currentUser.is_flagged);
                    if (action === 'accept' && flaggedParticipant && !this.dataset.safetyConfirmed) {
                        const button = this;
                        CyberGuardApp.confirm(
                            'Safety warning',
                            requested && requested.sender_flagged
                                ? '@' + requested.sender + ' is flagged as an Abusive User. Accept this request only if you are comfortable doing so.'
                                : 'Your account is flagged as an Abusive User. Review this request carefully before accepting.',
                            function (confirmed) {
                                if (confirmed) {
                                    button.dataset.safetyConfirmed = 'true';
                                    button.click();
                                }
                            }
                        );
                        return;
                    }
                    delete this.dataset.safetyConfirmed;

                    this.disabled = true;

                    try {
                        const res =
                            await CyberGuardApp.api(
                                '/api/friends/request/' +
                                encodeURIComponent(id) +
                                '/' +
                                encodeURIComponent(action),
                                {
                                    method: 'POST'
                                }
                            );

                        if (res && res.success) {

                            CyberGuardApp.toast(
                                action === 'accept'
                                    ? 'Friend request accepted'
                                    : 'Friend request rejected',
                                'success'
                            );

                            await Promise.all([
                                loadRequests(),
                                loadFriends()
                            ]);

                        } else {
                            CyberGuardApp.toast(
                                (res && res.message) ||
                                'Action failed',
                                'error'
                            );

                            this.disabled = false;
                        }

                    } catch (error) {

                        console.error(
                            '[Dashboard] Friend request error:',
                            error
                        );

                        CyberGuardApp.toast(
                            'Something went wrong. Please try again.',
                            'error'
                        );

                        this.disabled = false;
                    }
                }
            );
        });
    }

    function updateRequestBadge() {
        const badge =
            document.getElementById('requestBadge');

        if (!badge) return;

        if (pendingRequests.length > 0) {
            badge.textContent =
                pendingRequests.length;

            badge.style.display =
                'inline-flex';
        } else {
            badge.style.display =
                'none';
        }
    }

    /* =========================================================
       USER SEARCH
       ========================================================= */

    function initSearch() {
        const input =
            document.getElementById('globalSearch');

        const results =
            document.getElementById('searchResults');

        if (!input || !results) {
            return;
        }

        input.addEventListener(
            'input',
            function () {

                clearTimeout(searchTimer);

                const query =
                    this.value.trim();

                if (query.length < 2) {
                    results.classList.remove(
                        'active'
                    );

                    results.innerHTML = '';

                    return;
                }

                searchTimer =
                    setTimeout(
                        async function () {

                            try {
                                const res =
                                    await CyberGuardApp.api(
                                        '/api/users/search?q=' +
                                        encodeURIComponent(query)
                                    );

                                if (
                                    res &&
                                    res.success
                                ) {
                                    renderSearchResults(
                                        res.data || []
                                    );
                                } else {
                                    results.innerHTML =
                                        '<div class="search-result-item">' +
                                            '<span class="search-result-username">' +
                                                CyberGuardApp.escapeHtml(
                                                    res && res.message
                                                        ? res.message
                                                        : 'Search failed'
                                                ) +
                                            '</span>' +
                                        '</div>';

                                    results.classList.add(
                                        'active'
                                    );
                                }

                            } catch (error) {
                                console.error(
                                    '[Dashboard] Search error:',
                                    error
                                );
                            }

                        },
                        300
                    );
            }
        );

        document.addEventListener(
            'click',
            function (e) {

                if (
                    !input.contains(e.target) &&
                    !results.contains(e.target)
                ) {
                    results.classList.remove(
                        'active'
                    );
                }
            }
        );
    }

    function renderSearchResults(users) {
        const results =
            document.getElementById(
                'searchResults'
            );

        if (!results) return;

        if (!users || users.length === 0) {

            results.innerHTML =
                '<div class="search-result-item">' +
                    '<span class="search-result-username">' +
                        'No users found' +
                    '</span>' +
                '</div>';

            results.classList.add('active');

            return;
        }

        results.innerHTML =
            users.map(function (user) {

                let action = '';

                if (
                    user.friendship_status === 'friend'
                ) {

                    action =
                        '<span class="search-result-action friend">' +
                            'Friend' +
                        '</span>';

                } else if (
                    user.friendship_status === 'pending'
                ) {

                    action =
                        '<span class="search-result-action pending">' +
                            'Pending' +
                        '</span>';

                } else {

                    action =
                        '<button ' +
                            'class="search-result-action add" ' +
                            'data-username="' +
                            CyberGuardApp.escapeHtml(
                                user.username
                            ) +
                        '">' +
                            'Add' +
                        '</button>';
                }

                const safetyWarning = user.is_flagged
                    ? '<div class="safety-warning-card">⚠ This user is flagged as an Abusive User. Please review carefully before adding them.</div>'
                    : '';
                const senderFlagWarning = currentUser && currentUser.is_flagged
                    ? '<div class="safety-warning-card">⚠ Your account is flagged as an Abusive User. Please review this request carefully.</div>'
                    : '';

                return (
                    '<div class="search-result-item" ' +
                        'data-username="' +
                        CyberGuardApp.escapeHtml(
                            user.username
                        ) +
                    '">' +

                        '<div class="search-result-avatar">' +
                            CyberGuardApp.getInitials(
                                user.username
                            ) +
                        '</div>' +

                        '<div class="search-result-info">' +

                            '<div class="search-result-name">' +
                                CyberGuardApp.escapeHtml(
                                    user.display_name ||
                                    user.username
                                ) +
                            '</div>' +

                            '<div class="search-result-username">@' +
                                CyberGuardApp.escapeHtml(
                                    user.username
                                ) +
                            '</div>' +

                            (user.is_flagged
                                ? '<span class="abusive-user-badge">⚠ Abusive User</span>'
                                : '') +

                            safetyWarning +
                            senderFlagWarning +

                        '</div>' +

                        action +

                    '</div>'
                );

            }).join('');

        /*
         * Add friend buttons.
         */
        results.querySelectorAll(
            '.search-result-action.add'
        ).forEach(function (button) {

            button.addEventListener(
                'click',
                async function (e) {

                    e.stopPropagation();

                    if (this.disabled) return;

                    const username =
                        this.dataset.username;

                    if (!username) return;

                    const target = users.find(function (candidate) {
                        return candidate.username === username;
                    });
                    const needsWarning = !!(currentUser && currentUser.is_flagged) ||
                        !!(target && target.is_flagged);
                    if (needsWarning && !this.dataset.safetyConfirmed) {
                        const warning = target && target.is_flagged
                            ? 'This user is flagged as an Abusive User. Please make sure before adding them.'
                            : 'Your account is flagged as an Abusive User. Please review this request carefully.';
                        const button = this;
                        CyberGuardApp.confirm('Safety warning', warning, function (confirmed) {
                            if (confirmed) {
                                button.dataset.safetyConfirmed = 'true';
                                button.click();
                            }
                        });
                        return;
                    }
                    delete this.dataset.safetyConfirmed;

                    this.disabled = true;
                    this.textContent = '...';

                    try {

                        const res =
                            await CyberGuardApp.api(
                                '/api/friends/request',
                                {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        receiver: username
                                    })
                                }
                            );

                        if (res && res.success) {

                            CyberGuardApp.toast(
                                'Friend request sent to ' +
                                username,
                                'success'
                            );

                            this.textContent =
                                'Pending';

                            this.classList.remove(
                                'add'
                            );

                            this.classList.add(
                                'pending'
                            );

                            this.disabled = true;

                        } else {

                            CyberGuardApp.toast(
                                (res && res.message) ||
                                'Failed to send request',
                                'error'
                            );

                            this.textContent =
                                'Add';

                            this.disabled = false;
                        }

                    } catch (error) {

                        console.error(
                            '[Dashboard] Add friend error:',
                            error
                        );

                        CyberGuardApp.toast(
                            'Something went wrong. Please try again.',
                            'error'
                        );

                        this.textContent =
                            'Add';

                        this.disabled = false;
                    }
                }
            );
        });

        /*
         * Open existing friend chat.
         */
        results.querySelectorAll(
            '.search-result-item'
        ).forEach(function (item) {

            item.addEventListener(
                'click',
                function () {

                    const username =
                        this.dataset.username;

                    if (!username) return;

                    const user =
                        users.find(function (u) {
                            return (
                                u.username ===
                                username
                            );
                        });

                    if (
                        user &&
                        user.friendship_status ===
                        'friend'
                    ) {

                        openChat(username);

                        results.classList.remove(
                            'active'
                        );

                        const search =
                            document.getElementById(
                                'globalSearch'
                            );

                        if (search) {
                            search.value = '';
                        }
                    }
                }
            );
        });

        results.classList.add('active');
    }

    /* =========================================================
       TABS
       ========================================================= */

    function initTabs() {
        const tabs =
            document.querySelectorAll(
                '.sidebar-tab'
            );

        tabs.forEach(function (tab) {

            tab.addEventListener(
                'click',
                function () {

                    tabs.forEach(
                        function (item) {
                            item.classList.remove(
                                'active'
                            );
                        }
                    );

                    this.classList.add(
                        'active'
                    );

                    const target =
                        this.dataset.tab;

                    document
                        .querySelectorAll(
                            '.sidebar-list'
                        )
                        .forEach(
                            function (list) {
                                list.classList.remove(
                                    'active'
                                );
                            }
                        );

                    const targetList =
                        target === 'chats'
                            ? document.getElementById(
                                'chatList'
                            )
                            : document.getElementById(
                                'requestList'
                            );

                    if (targetList) {
                        targetList.classList.add(
                            'active'
                        );
                    }
                }
            );
        });
    }

    /* =========================================================
       MOBILE SIDEBAR
       ========================================================= */

    function openSidebar() {
        const sidebar =
            document.getElementById(
                'sidebar'
            );

        const overlay =
            document.getElementById(
                'sidebarOverlay'
            );

        if (sidebar) {
            sidebar.classList.add(
                'open'
            );
        }

        if (overlay) {
            overlay.classList.add(
                'active'
            );
        }
    }

    function closeSidebar() {
        const sidebar =
            document.getElementById(
                'sidebar'
            );

        const overlay =
            document.getElementById(
                'sidebarOverlay'
            );

        if (sidebar) {
            sidebar.classList.remove(
                'open'
            );
        }

        if (overlay) {
            overlay.classList.remove(
                'active'
            );
        }
    }

    function initSidebarToggle() {
        const menu =
            document.getElementById(
                'topbarMenu'
            );

        const close =
            document.getElementById(
                'sidebarClose'
            );

        const overlay =
            document.getElementById(
                'sidebarOverlay'
            );

        const mobileNew =
            document.getElementById(
                'mobileNewChat'
            );

        if (menu) {
            menu.addEventListener(
                'click',
                openSidebar
            );
        }

        if (close) {
            close.addEventListener(
                'click',
                closeSidebar
            );
        }

        if (overlay) {
            overlay.addEventListener(
                'click',
                closeSidebar
            );
        }

        if (mobileNew) {
            mobileNew.addEventListener(
                'click',
                openSidebar
            );
        }
    }

    /* =========================================================
       NOTIFICATIONS
       ========================================================= */

    function initNotificationToggle() {
        const button =
            document.getElementById(
                'topbarNotif'
            );

        if (!button) return;

        button.addEventListener(
            'click',
            function () {

                if (
                    window.Notifications &&
                    typeof Notifications.init ===
                    'function'
                ) {
                    Notifications.init();
                }
            }
        );
    }

    /* =========================================================
       OPEN CHAT
       ========================================================= */

    function openChat(username) {
        if (!username) return;

        activeChatUser =
            username;

        /*
         * Close mobile sidebar immediately.
         */
        closeSidebar();

        /*
         * Switch from empty state to chat.
         */
        const empty =
            document.getElementById(
                'chatEmpty'
            );

        const active =
            document.getElementById(
                'chatActive'
            );

        if (empty) {
            empty.style.display =
                'none';
        }

        if (active) {
            active.style.display =
                'flex';
        }

        /*
         * Highlight active conversation.
         */
        renderChatList();

        /*
         * Let ChatModule load the conversation.
         */
        if (
            window.ChatModule &&
            typeof ChatModule.openChat ===
            'function'
        ) {
            ChatModule.openChat(
                username
            );
        }
    }

    /* =========================================================
       SOCKET EVENTS
       ========================================================= */

    function initSocketHandlers() {
        if (socketHandlersInitialized) {
            return;
        }

        socketHandlersInitialized = true;

        CyberGuardSocket.on(
            'user_online',
            function (data) {

                if (!data || !data.username) {
                    return;
                }

                updateFriendStatus(
                    data.username,
                    'online'
                );
            }
        );

        CyberGuardSocket.on(
            'user_offline',
            function (data) {

                if (!data || !data.username) {
                    return;
                }

                updateFriendStatus(
                    data.username,
                    'offline'
                );
            }
        );

        CyberGuardSocket.on(
            'new_friend_request',
            function (data) {

                loadRequests();

                if (
                    window.Notifications &&
                    typeof Notifications.add ===
                    'function'
                ) {
                    Notifications.add({
                        id:
                            data &&
                            data.notification_id,

                        title:
                            'New Friend Request',

                        message:
                            data &&
                            data.message
                                ? data.message
                                : 'You received a new friend request.',

                        is_read: false,

                        created_at:
                            new Date().toISOString()
                    });
                }
            }
        );

        CyberGuardSocket.on(
            'friend_request_accepted',
            function (data) {

                CyberGuardApp.toast(
                    (
                        data &&
                        data.from
                            ? data.from
                            : 'User'
                    ) +
                    ' accepted your friend request',
                    'success'
                );

                loadFriends();
            }
        );

        CyberGuardSocket.on(
            'friend_request_rejected',
            function () {
                loadFriends();
            }
        );

        CyberGuardSocket.on(
            'friend_removed',
            function (data) {
                handleFriendRemoved(data);
            }
        );

        /*
         * Receiver gets receive_message.
         */
        CyberGuardSocket.on(
            'receive_message',
            function (data) {

                if (!data) return;

                /*
                 * If the message belongs to another
                 * conversation, refresh unread counts.
                 */
                if (
                    activeChatUser !==
                    data.sender
                ) {
                    renderChatList();
                }
            }
        );
    }

    /* =========================================================
       FRIEND STATUS
       ========================================================= */

    function updateFriendStatus(
        username,
        status
    ) {
        if (!username) return;

        const items =
            document.querySelectorAll(
                '.chat-list-item'
            );

        items.forEach(function (item) {

            if (
                item.dataset.username ===
                username
            ) {

                const dot =
                    item.querySelector(
                        '.status-dot'
                    );

                if (dot) {
                    dot.className =
                        'status-dot status-dot--' +
                        (
                            status === 'online'
                                ? 'online'
                                : 'offline'
                        );
                }
            }
        });

        /*
         * Update active chat header.
         */
        if (
            activeChatUser === username &&
            window.ChatModule &&
            typeof ChatModule.updateUserStatus ===
            'function'
        ) {
            ChatModule.updateUserStatus(
                status
            );
        }
    }

    /* =========================================================
       PUBLIC API
       ========================================================= */

    function refreshChatList() {
        renderChatList();
    }

    function handleFriendRemoved(data) {
        if (!data || !data.removed_user) return;
        const removedUser = data.removed_user;
        if (activeChatUser === removedUser) {
            activeChatUser = null;
            if (window.ChatModule && typeof ChatModule.closeCurrentChat === 'function') {
                ChatModule.closeCurrentChat();
            }
        }
        if (window.Notifications && typeof Notifications.add === 'function') {
            Notifications.add({
                id: data.notification_id,
                title: 'Friend removed',
                message: data.message || ('You and @' + removedUser + ' are no longer friends.'),
                is_read: false,
                created_at: data.created_at || new Date().toISOString()
            });
        }
        loadFriends();
    }

    function closeActiveChat() {
        activeChatUser = null;
        if (window.ChatModule && typeof ChatModule.closeCurrentChat === 'function') {
            ChatModule.closeCurrentChat();
        }
        renderChatList();
        if (window.matchMedia('(max-width: 768px)').matches) {
            openSidebar();
        }
    }

    return {
        init: init,
        openChat: openChat,
        refreshChatList: refreshChatList,
        handleFriendRemoved: handleFriendRemoved,
        closeActiveChat: closeActiveChat,

        getCurrentUser: function () {
            return currentUser;
        },

        getActiveChatUser: function () {
            return activeChatUser;
        }
    };

})();

window.Dashboard = Dashboard;

/* =========================================================
   AUTO INITIALIZATION
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    function () {

        if (
            document.getElementById(
                'appLayout'
            )
        ) {
            Dashboard.init();
        }
    }
);
