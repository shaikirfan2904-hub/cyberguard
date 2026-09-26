/**
 * CyberGuard AI — Chat JS
 * Handles:
 * - Chat loading
 * - Normal messages
 * - Blocked messages
 * - Typing indicators
 * - Read receipts
 * - Message deletion
 * - Message search
 * - Friend removal
 * - PC right-click message actions
 * - Mobile long-press message actions
 */

const ChatModule = (function () {

    'use strict';

    let currentChatUser = null;
    let messages = [];

    let currentPage = 1;
    let hasMore = true;
    let loadingMessages = false;

    let typingTimer = null;
    let isTyping = false;

    let lastDateLabel = null;
    let newMessagesDividerShown = false;


    /* =========================================================
       OPEN CHAT
    ========================================================= */

    async function openChat(username) {

        if (!username) {
            return;
        }

        currentChatUser = username;

        const emptyState = document.getElementById('chatEmpty');
        const activeChat = document.getElementById('chatActive');

        if (emptyState) {
            emptyState.style.display = 'none';
        }

        if (activeChat) {
            activeChat.style.display = 'flex';
        }

        messages = [];
        currentPage = 1;
        hasMore = true;
        loadingMessages = false;

        lastDateLabel = null;
        newMessagesDividerShown = false;

        await updateChatHeader(username);

        /* JOIN SOCKET CHAT ROOM */
        if (
            window.CyberGuardSocket &&
            CyberGuardSocket.isConnected()
        ) {
            CyberGuardSocket.emit(
                'join_chat',
                {
                    username: username
                }
            );
        }

        /* LOAD OLD MESSAGES */
        await loadMessages();

        /* MARK MESSAGES AS READ */
        if (
            window.CyberGuardSocket &&
            CyberGuardSocket.isConnected()
        ) {
            CyberGuardSocket.emit(
                'message_read',
                {
                    username: username
                }
            );
        }

        /* COMPOSER */
        initComposer();

        /* HEADER ACTIONS */
        initChatHeaderActions();

        /* REFRESH CHAT LIST */
        refreshChatList();
    }


    /* =========================================================
       CHAT HEADER
    ========================================================= */

    async function updateChatHeader(username) {

        try {

            const res =
                await CyberGuardApp.api(
                    '/api/users/' +
                    encodeURIComponent(username)
                );

            if (!res || !res.success) {
                return;
            }

            const d = res.data || {};

            const nameElement =
                document.getElementById('chatHeaderName');

            if (nameElement) {
                nameElement.textContent =
                    d.display_name ||
                    d.username ||
                    username;
            }

            const avatar =
                document.getElementById('chatHeaderAvatar');

            if (avatar) {

                avatar.innerHTML =
                    CyberGuardApp.getInitials(username) +
                    '<span class="status-dot status-dot--' +
                    (
                        d.online
                            ? 'online'
                            : 'offline'
                    ) +
                    '"></span>';
            }

            const statusText =
                document.getElementById(
                    'chatHeaderStatusText'
                );

            const statusDot =
                document.getElementById(
                    'chatHeaderStatusDot'
                );

            if (d.online) {

                if (statusText) {
                    statusText.textContent = 'Online';
                }

                if (statusDot) {
                    statusDot.className =
                        'status-dot status-dot--online';
                }

            } else {

                if (statusText) {

                    statusText.textContent =
                        d.last_seen
                            ? 'Last seen ' +
                              CyberGuardApp.formatTime(
                                  d.last_seen
                              )
                            : 'Offline';
                }

                if (statusDot) {
                    statusDot.className =
                        'status-dot status-dot--offline';
                }
            }

        } catch (error) {

            console.error(
                '[Chat] Header error:',
                error
            );
        }
    }


    /* =========================================================
       USER STATUS
    ========================================================= */

    function updateUserStatus(status) {

        if (!currentChatUser) {
            return;
        }

        const dot =
            document.querySelector(
                '#chatHeaderAvatar .status-dot'
            );

        const text =
            document.getElementById(
                'chatHeaderStatusText'
            );

        const statusDot =
            document.getElementById(
                'chatHeaderStatusDot'
            );

        if (status === 'online') {

            if (dot) {
                dot.className =
                    'status-dot status-dot--online';
            }

            if (statusDot) {
                statusDot.className =
                    'status-dot status-dot--online';
            }

            if (text) {
                text.textContent = 'Online';
            }

        } else {

            if (dot) {
                dot.className =
                    'status-dot status-dot--offline';
            }

            if (statusDot) {
                statusDot.className =
                    'status-dot status-dot--offline';
            }

            if (text) {
                text.textContent = 'Offline';
            }
        }
    }


    /* =========================================================
       LOAD MESSAGES
    ========================================================= */

    async function loadMessages() {

        if (
            !currentChatUser ||
            loadingMessages
        ) {
            return;
        }

        loadingMessages = true;

        const loader =
            document.getElementById(
                'messagesLoader'
            );

        if (loader) {
            loader.style.display = 'flex';
        }

        try {

            const res =
                await CyberGuardApp.api(
                    '/api/messages/' +
                    encodeURIComponent(
                        currentChatUser
                    ) +
                    '?page=' +
                    currentPage
                );

            if (!res || !res.success) {

                console.error(
                    '[Chat] Failed to load messages:',
                    res ? res.message : 'No response'
                );

                return;
            }

            const newMsgs =
                Array.isArray(res.data)
                    ? res.data
                    : [];

            if (newMsgs.length < 50) {
                hasMore = false;
            }

            if (currentPage === 1) {
                messages = newMsgs;
            } else {
                messages = newMsgs.concat(messages);
            }

        } catch (error) {

            console.error(
                '[Chat] Message loading error:',
                error
            );

        } finally {

            loadingMessages = false;

            if (loader) {
                loader.style.display = 'none';
            }
        }
    }


    /* =========================================================
       LOAD MORE
    ========================================================= */

    async function loadMore() {

        if (
            !hasMore ||
            loadingMessages
        ) {
            return;
        }

        currentPage++;

        await loadMessages();
    }


    /* =========================================================
       RENDER MESSAGES
    ========================================================= */

    function renderMessages(prepend) {

        const list =
            document.getElementById(
                'messagesList'
            );

        const container =
            document.getElementById(
                'messagesContainer'
            );

        if (!list || !container) {
            return;
        }

        const wasNearBottom =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
            100;

        const previousScrollHeight =
            container.scrollHeight;

        list.innerHTML = '';

        lastDateLabel = null;
        newMessagesDividerShown = false;

        const currentUser =
            window.Dashboard &&
            typeof Dashboard.getCurrentUser === 'function'
                ? Dashboard.getCurrentUser()
                : null;

        const myUsername =
            currentUser
                ? currentUser.username
                : '';

        messages.forEach(function (msg) {

            /* DATE SEPARATOR */

            const dateLabel =
                CyberGuardApp.formatDateLabel(
                    msg.created_at
                );

            if (dateLabel !== lastDateLabel) {

                lastDateLabel = dateLabel;

                const separator =
                    document.createElement('div');

                separator.className =
                    'date-separator';

                separator.innerHTML =
                    '<span>' +
                    CyberGuardApp.escapeHtml(
                        dateLabel
                    ) +
                    '</span>';

                list.appendChild(separator);
            }

            /* NEW MESSAGES DIVIDER */

            if (
                !newMessagesDividerShown &&
                msg.receiver === myUsername &&
                !msg.read_at &&
                msg.message_type !== 'blocked'
            ) {

                newMessagesDividerShown = true;

                const divider =
                    document.createElement('div');

                divider.className =
                    'new-messages-divider';

                divider.innerHTML =
                    '<span>New Messages</span>';

                list.appendChild(divider);
            }

            /* MESSAGE */

            const element =
                createMessageElement(
                    msg,
                    myUsername
                );

            if (element) {
                list.appendChild(element);
            }
        });

        /* EMPTY CHAT */

        if (messages.length === 0) {

            list.innerHTML =
                '<div class="empty-state empty-state--sm">' +
                    '<p>No messages yet. Say hello!</p>' +
                '</div>';
        }

        /* SCROLL */

        if (
            prepend &&
            !wasNearBottom
        ) {

            container.scrollTop =
                container.scrollHeight -
                previousScrollHeight;

        } else {

            container.scrollTop =
                container.scrollHeight;
        }
    }


    /* =========================================================
       MESSAGE ACTION MENU HELPERS
    ========================================================= */

    function hideAllMessageActions() {

        document
            .querySelectorAll(
                '.message-actions.is-visible'
            )
            .forEach(function (menu) {

                menu.classList.remove(
                    'is-visible'
                );
            });
    }


    document.addEventListener(
        'click',
        function () {
            hideAllMessageActions();
        }
    );


    document.addEventListener(
        'keydown',
        function (event) {

            if (event.key === 'Escape') {
                hideAllMessageActions();
            }
        }
    );


    /* =========================================================
       CREATE MESSAGE ELEMENT
    ========================================================= */

    function createMessageElement(
        msg,
        myUsername
    ) {

        const isOutgoing =
            msg.sender === myUsername;

        const div =
            document.createElement('div');

        /* BLOCKED MESSAGE */

        const isBlocked =
            msg.message_type === 'blocked' ||
            msg.blocked === true ||
            msg.message ===
                'Message blocked due to privacy.';

        if (isBlocked) {

            div.className =
                'message message--blocked';

            div.dataset.id =
                msg.id || '';

            div.innerHTML =
                '<div class="blocked-chat-message">' +

                    '<span class="blocked-chat-icon">' +
                        '⚠' +
                    '</span>' +

                    '<span class="blocked-chat-text">' +
                        'Message blocked due to privacy.' +
                    '</span>' +

                '</div>' +

                '<div class="blocked-chat-time">' +
                    CyberGuardApp.formatTimeShort(
                        msg.created_at
                    ) +
                '</div>';

            return div;
        }

        /* NORMAL / DELETED MESSAGE */

        const isDeleted =
            msg.is_deleted ||
            msg.deleted_for_everyone;

        div.className =
            'message message--' +
            (
                isOutgoing
                    ? 'out'
                    : 'in'
            );

        div.dataset.id =
            msg.id || '';

        const bubbleClass =
            isDeleted
                ? 'message-bubble message-bubble--deleted'
                : 'message-bubble';

        const text =
            isDeleted
                ? 'This message was deleted.'
                : CyberGuardApp.escapeHtml(
                    msg.message || ''
                );

        /* STATUS ICON */

        let statusIcon = '';

        if (
            isOutgoing &&
            !isDeleted
        ) {

            if (msg.read_at) {

                statusIcon =
                    '<span class="message-status message-status--read" title="Read">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<polyline points="20 6 9 17 4 12"/>' +
                            '<polyline points="20 6 9 17 4 12" transform="translate(4,0)"/>' +
                        '</svg>' +
                    '</span>';

            } else if (msg.delivered_at) {

                statusIcon =
                    '<span class="message-status message-status--delivered" title="Delivered">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<polyline points="20 6 9 17 4 12"/>' +
                            '<polyline points="20 6 9 17 4 12" transform="translate(4,0)"/>' +
                        '</svg>' +
                    '</span>';

            } else {

                statusIcon =
                    '<span class="message-status message-status--sent" title="Sent">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<polyline points="20 6 9 17 4 12"/>' +
                        '</svg>' +
                    '</span>';
            }
        }

        /* MESSAGE ACTIONS */

        let actions = '';

        if (!isDeleted) {

            actions =
                '<div class="message-actions">' +

                    '<button class="message-action-btn" ' +
                        'data-action="copy" ' +
                        'title="Copy">' +

                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
                            '<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>' +
                        '</svg>' +

                    '</button>';

            if (isOutgoing) {

                actions +=

                    '<button class="message-action-btn message-action-btn--danger" ' +
                        'data-action="delete-everyone" ' +
                        'title="Delete for everyone">' +

                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>' +
                        '</svg>' +

                    '</button>';
            }

            
        }

        div.innerHTML =

            '<div class="' +
                bubbleClass +
            '">' +

                text +

                actions +

            '</div>' +

            '<div class="message-meta">' +

                '<span class="message-time">' +
                    CyberGuardApp.formatTimeShort(
                        msg.created_at
                    ) +
                '</span>' +

                statusIcon +

            '</div>';

        /* =====================================================
           RIGHT CLICK — PC
           ===================================================== */

        const actionMenu =
            div.querySelector(
                '.message-actions'
            );

        if (actionMenu) {

            let longPressTimer = null;
            let touchMoved = false;

            /* PC RIGHT CLICK */

            div.addEventListener(
                'contextmenu',
                function (event) {

                    event.preventDefault();
                    event.stopPropagation();

                    hideAllMessageActions();

                    actionMenu.classList.add(
                        'is-visible'
                    );
                }
            );

            /* MOBILE LONG PRESS */

            div.addEventListener(
                'touchstart',
                function () {

                    touchMoved = false;

                    clearTimeout(
                        longPressTimer
                    );

                    longPressTimer =
                        setTimeout(
                            function () {

                                if (!touchMoved) {

                                    hideAllMessageActions();

                                    actionMenu.classList.add(
                                        'is-visible'
                                    );

                                    if (
                                        navigator.vibrate
                                    ) {
                                        navigator.vibrate(30);
                                    }
                                }

                            },
                            500
                        );
                },
                {
                    passive: true
                }
            );

            div.addEventListener(
                'touchmove',
                function () {

                    touchMoved = true;

                    clearTimeout(
                        longPressTimer
                    );
                },
                {
                    passive: true
                }
            );

            div.addEventListener(
                'touchend',
                function () {
                    clearTimeout(longPressTimer);
                }
            );

            div.addEventListener(
                'touchcancel',
                function () {
                    clearTimeout(longPressTimer);
                }
            );

            /* ACTION BUTTONS */

            actionMenu
                .querySelectorAll(
                    '.message-action-btn'
                )
                .forEach(
                    function (button) {

                        button.addEventListener(
                            'click',
                            function (event) {

                                event.preventDefault();
                                event.stopPropagation();

                                actionMenu.classList.remove(
                                    'is-visible'
                                );

                                handleMessageAction(
                                    this.dataset.action,
                                    msg,
                                    div
                                );
                            }
                        );
                    }
                );
        }

        return div;
    }


    /* =========================================================
       MESSAGE ACTION HANDLER
    ========================================================= */

    async function handleMessageAction(
        action,
        msg,
        element
    ) {

        /* COPY */

        if (action === 'copy') {

            try {

                await navigator.clipboard.writeText(
                    msg.message || ''
                );

                CyberGuardApp.toast(
                    'Message copied',
                    'success'
                );

            } catch (error) {

                CyberGuardApp.toast(
                    'Copy failed',
                    'error'
                );
            }

            return;
        }

        /* DELETE FOR ME */

        if (action === 'delete-me') {

            CyberGuardApp.confirm(
                'Delete message',
                'Delete this message for you only?',
                function (ok) {

                    if (ok) {

                        doDelete(
                            msg.id,
                            false,
                            element
                        );
                    }
                }
            );

            return;
        }

        /* DELETE FOR EVERYONE */

        if (action === 'delete-everyone') {

            CyberGuardApp.confirm(
                'Delete for everyone',
                'This message will be deleted for everyone. Continue?',
                function (ok) {

                    if (ok) {

                        doDelete(
                            msg.id,
                            true,
                            element
                        );
                    }
                }
            );
        }
    }


    /* =========================================================
       DELETE MESSAGE
    ========================================================= */

    async function doDelete(
        msgId,
        everyone,
        element
    ) {

        if (!msgId) {

            CyberGuardApp.toast(
                'This message cannot be deleted.',
                'error'
            );

            return;
        }

        const url =
            '/api/messages/' +
            msgId +
            (
                everyone
                    ? '?everyone=true'
                    : ''
            );

        try {

            const res =
                await CyberGuardApp.api(
                    url,
                    {
                        method: 'DELETE'
                    }
                );

            if (!res.success) {

                CyberGuardApp.toast(
                    res.message ||
                    'Delete failed',
                    'error'
                );

                return;
            }

            const bubble =
                element.querySelector(
                    '.message-bubble'
                );

            if (bubble) {

                bubble.className =
                    'message-bubble message-bubble--deleted';

                bubble.textContent =
                    'This message was deleted.';
            }

            const actions =
                element.querySelector(
                    '.message-actions'
                );

            if (actions) {
                actions.remove();
            }

            CyberGuardApp.toast(
                'Message deleted',
                'success'
            );

        } catch (error) {

            console.error(
                '[Chat] Delete error:',
                error
            );

            CyberGuardApp.toast(
                'Delete failed',
                'error'
            );
        }
    }


    /* =========================================================
       COMPOSER
    ========================================================= */

    function initComposer() {

        const input =
            document.getElementById(
                'messageInput'
            );

        const sendButton =
            document.getElementById(
                'sendBtn'
            );

        if (!input || !sendButton) {

            console.warn(
                '[Chat] Composer elements not found.'
            );

            return;
        }

        /*
         * Remove old handlers by cloning.
         * This prevents duplicate listeners when
         * switching conversations.
         */

        const newInput =
            input.cloneNode(true);

        const newSendButton =
            sendButton.cloneNode(true);

        input.parentNode.replaceChild(
            newInput,
            input
        );

        sendButton.parentNode.replaceChild(
            newSendButton,
            sendButton
        );

        const messageInput =
            document.getElementById(
                'messageInput'
            );

        const messageSendButton =
            document.getElementById(
                'sendBtn'
            );

        const updateCounter =
            function () {

                const counter =
                    document.getElementById(
                        'charCounter'
                    );

                if (!counter) {
                    return;
                }

                const length =
                    messageInput.value.length;

                counter.textContent =
                    length + '/2000';

                counter.classList.remove(
                    'char-counter--warning',
                    'char-counter--danger'
                );

                if (length >= 1800) {

                    counter.classList.add(
                        'char-counter--warning'
                    );
                }

                if (length >= 1950) {

                    counter.classList.add(
                        'char-counter--danger'
                    );
                }
            };

        messageInput.addEventListener(
            'input',
            function () {

                updateCounter();

                messageSendButton.disabled =
                    messageInput.value.trim().length === 0;

                if (
                    messageInput.value.trim().length > 0
                ) {

                    startTyping();

                } else {

                    stopTyping();
                }
            }
        );

        messageInput.addEventListener(
            'keydown',
            function (event) {

                if (
                    event.key === 'Enter' &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendCurrentMessage();
                }
            }
        );

        messageSendButton.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                sendCurrentMessage();
            }
        );

        updateCounter();
    }


    /* =========================================================
       SEND MESSAGE
    ========================================================= */

    function sendCurrentMessage() {

        if (!currentChatUser) {

            CyberGuardApp.toast(
                'Select a conversation first.',
                'error'
            );

            return;
        }

        const input =
            document.getElementById(
                'messageInput'
            );

        if (!input) {
            return;
        }

        const text =
            input.value.trim();

        if (!text) {
            return;
        }

        if (text.length > 2000) {

            CyberGuardApp.toast(
                'Message is too long.',
                'error'
            );

            return;
        }

        if (
            !window.CyberGuardSocket ||
            !CyberGuardSocket.isConnected()
        ) {

            CyberGuardApp.toast(
                'Connection is not available. Please wait.',
                'error'
            );

            return;
        }

        const sent =
            CyberGuardSocket.emit(
                'send_message',
                {
                    receiver: currentChatUser,
                    message: text
                }
            );

        /*
         * Some socket wrappers return undefined even
         * when socket.emit() succeeds. Therefore only
         * treat explicit false as failure.
         */

        if (sent === false) {

            CyberGuardApp.toast(
                'Message could not be sent.',
                'error'
            );

            return;
        }
    }


    /* =========================================================
       SOCKET MESSAGE HANDLERS
    ========================================================= */

    function initSocketHandlers() {

        if (
            !window.CyberGuardSocket
        ) {
            return;
        }

        /* SENDER: NORMAL MESSAGE */

        CyberGuardSocket.on(
            'message_sent',
            function (data) {

                if (!data) {
                    return;
                }

                if (
                    data.receiver !==
                    currentChatUser
                ) {
                    return;
                }

                messages.push(data);

                renderMessages(false);

                const input =
                    document.getElementById(
                        'messageInput'
                    );

                if (input) {

                    input.value = '';

                    input.dispatchEvent(
                        new Event('input')
                    );
                }

                stopTyping();

                refreshChatList();
            }
        );


        /* RECEIVER: NORMAL MESSAGE */

        CyberGuardSocket.on(
            'receive_message',
            function (data) {

                if (!data) {
                    return;
                }

                const currentUser =
                    Dashboard.getCurrentUser();

                const myUsername =
                    currentUser
                        ? currentUser.username
                        : '';

                /*
                * IMPORTANT:
                * The sender already receives this message
                * through the "message_sent" event.
                *
                * Do not add it again if this socket also
                * receives "receive_message".
                */
                if (data.sender === myUsername) {
                    return;
                }

                if (
                    data.sender ===
                    currentChatUser
                ) {

                    messages.push(data);

                    renderMessages(false);

                    if (
                        CyberGuardSocket.isConnected()
                    ) {
                        CyberGuardSocket.emit(
                            'message_read',
                            {
                                username:
                                    currentChatUser
                            }
                        );
                    }

                } else {
                    refreshChatList();
                }
            }
        );



        /* -----------------------------------------
            MESSAGE DELETED FOR EVERYONE
            ----------------------------------------- */

            CyberGuardSocket.on(
                'message_deleted',
                function (data) {

                    console.log(
                        '[Chat] Message deleted for everyone:',
                        data
                    );

                    if (!data || !data.message_id) {
                        return;
                    }

                    const deletedMessageId = String(
                        data.message_id
                    );

                    /*
                    * Update the message in our local array.
                    */
                    const message = messages.find(function (msg) {
                        return String(msg.id) === deletedMessageId;
                    });

                    if (message) {
                        message.message = 'This message was deleted.';
                        message.is_deleted = true;
                        message.deleted_for_everyone = true;
                    }

                    /*
                    * Update the message immediately on screen.
                    */
                    const messageElement =
                        document.querySelector(
                            '.message[data-id="' +
                            deletedMessageId +
                            '"]'
                        );

                    if (messageElement) {

                        const bubble =
                            messageElement.querySelector(
                                '.message-bubble'
                            );

                        if (bubble) {
                            bubble.className =
                                'message-bubble message-bubble--deleted';

                            bubble.textContent =
                                'This message was deleted.';
                        }

                        const actions =
                            messageElement.querySelector(
                                '.message-actions'
                            );

                        if (actions) {
                            actions.remove();
                        }
                    }

                    /*
                    * Refresh sidebar preview.
                    */
                    if (
                        window.Dashboard &&
                        typeof Dashboard.refreshChatList === 'function'
                    ) {
                        Dashboard.refreshChatList();
                    }
                }
            );




        /* SENDER: BLOCKED MESSAGE */

        CyberGuardSocket.on(
            'blocked_message_sent',
            function (data) {

                if (!data) {
                    return;
                }

                if (
                    data.receiver !==
                    currentChatUser
                ) {
                    return;
                }

                const currentUser =
                    window.Dashboard &&
                    typeof Dashboard.getCurrentUser === 'function'
                        ? Dashboard.getCurrentUser()
                        : null;

                const blockedMessage = {

                    id:
                        data.id ||
                        data.message_id,

                    sender:
                        data.sender ||
                        (
                            currentUser
                                ? currentUser.username
                                : ''
                        ),

                    receiver:
                        data.receiver ||
                        currentChatUser,

                    message:
                        'Message blocked due to privacy.',

                    message_type:
                        'blocked',

                    created_at:
                        data.created_at ||
                        new Date().toISOString(),

                    blocked:
                        true
                };

                messages.push(
                    blockedMessage
                );

                renderMessages(false);

                const input =
                    document.getElementById(
                        'messageInput'
                    );

                if (input) {

                    input.value = '';

                    input.dispatchEvent(
                        new Event('input')
                    );
                }

                stopTyping();

                refreshChatList();
            }
        );


        /* RECEIVER: BLOCKED MESSAGE */

        CyberGuardSocket.on(
            'receive_blocked_message',
            function (data) {

                if (!data) {
                    return;
                }

                if (
                    data.sender ===
                    currentChatUser
                ) {

                    const blockedMessage = {

                        id:
                            data.id ||
                            data.message_id,

                        sender:
                            data.sender,

                        receiver:
                            data.receiver,

                        message:
                            'Message blocked due to privacy.',

                        message_type:
                            'blocked',

                        created_at:
                            data.created_at ||
                            new Date().toISOString(),

                        blocked:
                            true
                    };

                    messages.push(
                        blockedMessage
                    );

                    renderMessages(false);

                    if (
                        CyberGuardSocket.isConnected()
                    ) {

                        CyberGuardSocket.emit(
                            'message_read',
                            {
                                username:
                                    currentChatUser
                            }
                        );
                    }

                } else {

                    refreshChatList();
                }
            }
        );


        /* MESSAGE BLOCKED NOTIFICATION */

        CyberGuardSocket.on(
            'message_blocked',
            function (data) {

                if (!data) {
                    return;
                }

                console.log(
                    '[Chat] Message blocked:',
                    data
                );

                /*
                 * Do not add another message here.
                 *
                 * The sender already receives
                 * blocked_message_sent, which adds the
                 * privacy-safe message to the live chat.
                 *
                 * This prevents duplicate blocked messages.
                 */

                const input =
                    document.getElementById(
                        'messageInput'
                    );

                if (
                    data.to === currentChatUser &&
                    input
                ) {

                    input.value = '';

                    input.dispatchEvent(
                        new Event('input')
                    );
                }

                stopTyping();

                refreshChatList();

                CyberGuardApp.toast(
                    'Message blocked due to privacy.',
                    'warning'
                );
            }
        );


        /* SOCKET ERROR */

        CyberGuardSocket.on(
            'error',
            function (data) {

                if (
                    data &&
                    data.message
                ) {

                    CyberGuardApp.toast(
                        data.message,
                        'error'
                    );
                }
            }
        );
    }


    /* =========================================================
       TYPING
    ========================================================= */

    function startTyping() {

        if (
            !currentChatUser ||
            !window.CyberGuardSocket ||
            !CyberGuardSocket.isConnected()
        ) {
            return;
        }

        if (!isTyping) {

            isTyping = true;

            CyberGuardSocket.emit(
                'typing_start',
                {
                    receiver:
                        currentChatUser
                }
            );
        }

        clearTimeout(
            typingTimer
        );

        typingTimer =
            setTimeout(
                stopTyping,
                1500
            );
    }


    function stopTyping() {

        clearTimeout(
            typingTimer
        );

        if (
            isTyping &&
            currentChatUser &&
            window.CyberGuardSocket &&
            CyberGuardSocket.isConnected()
        ) {

            CyberGuardSocket.emit(
                'typing_stop',
                {
                    receiver:
                        currentChatUser
                }
            );
        }

        isTyping = false;
    }


    /* =========================================================
       HEADER ACTIONS
    ========================================================= */

    function initChatHeaderActions() {

        /* MORE MENU */

        const moreBtn =
            document.getElementById(
                'chatMoreBtn'
            );

        const moreMenu =
            document.getElementById(
                'chatMoreMenu'
            );

        if (
            moreBtn &&
            moreMenu &&
            !moreBtn.dataset.chatBound
        ) {

            moreBtn.dataset.chatBound = 'true';

            moreBtn.addEventListener(
                'click',
                function (event) {

                    event.stopPropagation();

                    moreMenu.classList.toggle(
                        'active'
                    );
                }
            );

            document.addEventListener(
                'click',
                function () {

                    moreMenu.classList.remove(
                        'active'
                    );
                }
            );
        }


        /* CLEAR CHAT */

        const clearBtn =
            document.getElementById(
                'clearChatBtn'
            );

        if (
            clearBtn &&
            !clearBtn.dataset.chatBound
        ) {

            clearBtn.dataset.chatBound = 'true';

            clearBtn.addEventListener(
                'click',
                function () {

                    if (moreMenu) {
                        moreMenu.classList.remove(
                            'active'
                        );
                    }

                    CyberGuardApp.confirm(
                        'Clear conversation',
                        'Delete all messages in this conversation? This cannot be undone.',
                        function (ok) {

                            if (
                                ok &&
                                typeof clearChat === 'function'
                            ) {
                                clearChat();
                            }
                        }
                    );
                }
            );
        }


        /* REMOVE FRIEND */

        const removeBtn =
            document.getElementById(
                'removeFriendBtn'
            );

        if (
            removeBtn &&
            !removeBtn.dataset.chatBound
        ) {

            removeBtn.dataset.chatBound = 'true';

            removeBtn.addEventListener(
                'click',
                function () {

                    if (moreMenu) {
                        moreMenu.classList.remove(
                            'active'
                        );
                    }

                    CyberGuardApp.confirm(
                        'Remove friend',
                        'Remove ' +
                        currentChatUser +
                        ' from your friends list?',
                        function (ok) {

                            if (
                                ok &&
                                typeof removeFriend === 'function'
                            ) {
                                removeFriend();
                            }
                        }
                    );
                }
            );
        }


        /* SEARCH */

        const searchBtn =
            document.getElementById(
                'chatSearchBtn'
            );

        const searchBar =
            document.getElementById(
                'chatSearchBar'
            );

        const closeSearch =
            document.getElementById(
                'closeSearchBtn'
            );

        const searchInput =
            document.getElementById(
                'messageSearchInput'
            );

        if (
            searchBtn &&
            searchBar &&
            !searchBtn.dataset.chatBound
        ) {

            searchBtn.dataset.chatBound = 'true';

            searchBtn.addEventListener(
                'click',
                function (event) {

                    event.stopPropagation();

                    const isHidden =
                        searchBar.style.display === 'none' ||
                        searchBar.style.display === '';

                    searchBar.style.display =
                        isHidden
                            ? 'flex'
                            : 'none';

                    if (
                        isHidden &&
                        searchInput
                    ) {

                        searchInput.focus();
                    }
                }
            );
        }


        /* CLOSE SEARCH */

        if (
            closeSearch &&
            !closeSearch.dataset.chatBound
        ) {

            closeSearch.dataset.chatBound = 'true';

            closeSearch.addEventListener(
                'click',
                function () {

                    if (searchBar) {
                        searchBar.style.display =
                            'none';
                    }

                    if (searchInput) {
                        searchInput.value = '';
                    }

                    renderMessages(false);
                }
            );
        }


        /* SEARCH MESSAGES */

        if (
            searchInput &&
            !searchInput.dataset.chatBound
        ) {

            searchInput.dataset.chatBound = 'true';

            searchInput.addEventListener(
                'input',
                function () {

                    const query =
                        this.value
                            .trim()
                            .toLowerCase();

                    if (query.length < 2) {

                        renderMessages(false);

                        return;
                    }

                    const list =
                        document.getElementById(
                            'messagesList'
                        );

                    if (!list) {
                        return;
                    }

                    list
                        .querySelectorAll('.message')
                        .forEach(
                            function (message) {

                                const text =
                                    message.textContent
                                        .toLowerCase();

                                if (
                                    text.includes(query)
                                ) {

                                    message.classList.add(
                                        'highlighted'
                                    );

                                } else {

                                    message.classList.remove(
                                        'highlighted'
                                    );
                                }
                            }
                        );
                }
            );
        }
    }


    /* =========================================================
       CHAT LIST CLICK FALLBACK
    ========================================================= */

    function initChatListClickFallback() {

        if (
            window.__cyberGuardChatListClickBound
        ) {
            return;
        }

        window.__cyberGuardChatListClickBound =
            true;

        document.addEventListener(
            'click',
            function (event) {

                const item =
                    event.target.closest(
                        '.chat-list-item'
                    );

                if (!item) {
                    return;
                }

                const username =
                    item.dataset.username;

                if (!username) {
                    return;
                }

                openChat(username);
            }
        );
    }


    /* =========================================================
       CHAT LIST REFRESH
    ========================================================= */

    function refreshChatList() {

        if (
            window.Dashboard &&
            typeof Dashboard.refreshChatList ===
                'function'
        ) {

            Dashboard.refreshChatList();
        }
    }

    async function clearChat() {
        if (!currentChatUser) {
            return;
        }

        try {
            const response = await CyberGuardApp.api(
                '/api/messages/' + encodeURIComponent(currentChatUser) + '/clear',
                {
                    method: 'DELETE'
                }
            );

            if (!response || !response.success) {
                throw new Error(
                    response?.message || 'Failed to clear conversation.'
                );
            }

            // Clear only the currently visible conversation
            messages = [];
            currentPage = 1;
            hasMore = false;
            lastDateLabel = null;
            newMessagesDividerShown = false;

            renderMessages(false);

            // Close the three-dot menu
            const moreMenu = document.getElementById('chatMoreMenu');
            if (moreMenu) {
                moreMenu.classList.remove('active');
            }

            // Refresh the chat list
            if (window.Dashboard && typeof Dashboard.loadUsers === 'function') {
                Dashboard.loadUsers();
            }

            if (typeof showToast === 'function') {
                showToast('Conversation cleared', 'success');
            }

        } catch (error) {
            console.error('Clear conversation error:', error);

            if (typeof showToast === 'function') {
                showToast(
                    error.message || 'Failed to clear conversation',
                    'error'
                );
            }
        }
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    return {

        openChat:
            openChat,

        loadMore:
            loadMore,

        updateUserStatus:
            updateUserStatus,

        initSocketHandlers:
            initSocketHandlers,

        initChatListClickFallback:
            initChatListClickFallback
    };

})(); /* IMPORTANT: close and invoke the IIFE correctly */


/* =========================================================
   GLOBAL MODULE
========================================================= */

window.ChatModule =
    ChatModule;


/* =========================================================
   INITIALIZE
========================================================= */

ChatModule.initChatListClickFallback();

if (
    window.CyberGuardSocket
) {

    ChatModule.initSocketHandlers();
}
