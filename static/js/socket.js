/**
 * CyberGuard AI — Socket.IO connection manager
 *
 * Responsibilities:
 * - Create Socket.IO connection
 * - Maintain connection state
 * - Send events to Flask
 * - Receive server events
 * - Route events to application modules
 */

const CyberGuardSocket = (function () {

    'use strict';


    /* =========================================================
       PRIVATE STATE
    ========================================================= */

    let socket = null;

    let connected = false;

    const handlers = {};


    /* =========================================================
       REGISTER EVENT HANDLER
    ========================================================= */

    function on(
        event,
        callback
    ) {

        if (
            !event ||
            typeof callback !== 'function'
        ) {

            return;
        }


        if (
            !handlers[event]
        ) {

            handlers[event] = [];
        }


        handlers[event].push(
            callback
        );
    }


    /* =========================================================
       CONNECT
    ========================================================= */

    function connect() {

        /*
         * Already connected.
         */

        if (
            socket &&
            socket.connected
        ) {

            connected = true;

            return;
        }


        /*
         * Socket.IO library missing.
         */

        if (
            typeof io === 'undefined'
        ) {

            console.error(
                '[Socket] Socket.IO client is not loaded.'
            );


            connected = false;


            if (
                window.CyberGuardApp &&
                typeof CyberGuardApp.setConnectionStatus ===
                'function'
            ) {

                CyberGuardApp.setConnectionStatus(
                    false
                );
            }


            return;
        }


        console.log(
            '[Socket] Starting connection...'
        );


        /*
         * Create connection.
         */

        socket =
            io({
                transports: [
                    'polling',
                    'websocket'
                ],

                reconnection:
                    true,

                reconnectionAttempts:
                    Infinity,

                reconnectionDelay:
                    1000,

                reconnectionDelayMax:
                    5000,

                timeout:
                    20000
            });


        /* =====================================================
           CONNECTED
        ===================================================== */

        socket.on(
            'connect',
            function () {

                connected = true;


                console.log(
                    '[Socket] Connected'
                );


                console.log(
                    '[Socket] ID:',
                    socket.id
                );


                if (
                    window.CyberGuardApp &&
                    typeof CyberGuardApp.setConnectionStatus ===
                    'function'
                ) {

                    CyberGuardApp.setConnectionStatus(
                        true
                    );
                }


                trigger(
                    'connected'
                );
            }
        );


        /* =====================================================
           DISCONNECTED
        ===================================================== */

        socket.on(
            'disconnect',
            function (reason) {

                connected = false;


                console.warn(
                    '[Socket] Disconnected:',
                    reason
                );


                if (
                    window.CyberGuardApp &&
                    typeof CyberGuardApp.setConnectionStatus ===
                    'function'
                ) {

                    CyberGuardApp.setConnectionStatus(
                        false
                    );
                }


                trigger(
                    'disconnected',
                    {
                        reason:
                            reason
                    }
                );
            }
        );


        /* =====================================================
           CONNECTION ERROR
        ===================================================== */

        socket.on(
            'connect_error',
            function (error) {

                connected = false;


                console.error(
                    '[Socket] Connection error:',
                    error
                );


                if (
                    window.CyberGuardApp &&
                    typeof CyberGuardApp.setConnectionStatus ===
                    'function'
                ) {

                    CyberGuardApp.setConnectionStatus(
                        false
                    );
                }


                trigger(
                    'connect_error',
                    error
                );
            }
        );


        /* =====================================================
           SERVER EVENTS
        ===================================================== */

        const events = [

            /*
             * Chat
             */

            'receive_message',

            'message_sent',

            'receive_blocked_message',

            'blocked_message_sent',

            'message_blocked',


            /*
             * Typing
             */

            'typing_start',

            'typing_stop',


            /*
             * Read / delivery
             */

            'message_read_receipt',

            'message_delivered',


            /*
             * User status
             */

            'user_online',

            'user_offline',

            'online_users',


            /*
             * Friend requests
             */

            'new_friend_request',

            'friend_request_accepted',

            'friend_request_rejected',


            /*
             * Notifications
             */

            'notification',


            /*
             * Errors
             */

            'error',


            /*
             * Admin
             */

            'admin_blocked_message'

        ];


        events.forEach(
            function (eventName) {

                socket.on(
                    eventName,
                    function (data) {

                        console.log(
                            '[Socket] Received:',
                            eventName,
                            data
                        );


                        trigger(
                            eventName,
                            data
                        );
                    }
                );
            }
        );
    }


    /* =========================================================
       EMIT EVENT
    ========================================================= */

    function emit(
        event,
        data
    ) {

        /*
         * Socket object does not exist.
         */

        if (!socket) {

            console.warn(
                '[Socket] Cannot emit "' +
                event +
                '" — socket does not exist.'
            );


            return false;
        }


        /*
         * Socket is not connected.
         */

        if (
            !socket.connected
        ) {

            console.warn(
                '[Socket] Cannot emit "' +
                event +
                '" — socket is not connected.'
            );


            return false;
        }


        /*
         * Send event.
         */

        socket.emit(
            event,
            data
        );


        console.log(
            '[Socket] Emit:',
            event,
            data
        );


        return true;
    }


    /* =========================================================
       TRIGGER LOCAL HANDLERS
    ========================================================= */

    function trigger(
        event,
        data
    ) {

        const eventHandlers =
            handlers[event] || [];


        eventHandlers.forEach(
            function (callback) {

                try {

                    callback(
                        data
                    );

                } catch (error) {

                    console.error(
                        '[Socket] Handler error for "' +
                        event +
                        '":',
                        error
                    );
                }
            }
        );
    }


    /* =========================================================
       CONNECTION STATUS
    ========================================================= */

    function isConnected() {

        return !!(
            socket &&
            socket.connected &&
            connected
        );
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    return {

        connect:
            connect,

        emit:
            emit,

        on:
            on,

        isConnected:
            isConnected

    };

})();


/*
 * Make globally available.
 */

window.CyberGuardSocket =
    CyberGuardSocket;