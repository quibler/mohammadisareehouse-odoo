/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

/**
 * SAFE NAVIGATION APPROACH: Simulate button clicks instead of calling showScreen directly
 * This avoids the orderUuid issue by using the same methods the UI uses
 */

// Global flags to track manual user interactions
let isManualClick = false;
let manualClickTime = 0;
let lastManualMode = null; // Track which mode was manually selected
let lastUserInteractionTime = 0; // Track ANY user interaction

// Global Navigation Manager using button simulation
class SafeNavigationManager {
    constructor() {
        this.isActive = false;
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    activate() {
        if (this.isActive) return;
        document.addEventListener('keydown', this.handleKeydown, { capture: true, passive: false });
        this.isActive = true;
    }

    deactivate() {
        if (!this.isActive) return;
        document.removeEventListener('keydown', this.handleKeydown, { capture: true });
        this.isActive = false;
    }

    /**
     * Get current screen using DOM detection
     */
    getCurrentScreen() {
        const screenMappings = [
            { selector: '.product-screen:not(.oe_hidden)', name: 'ProductScreen' },
            { selector: '.payment-screen:not(.oe_hidden)', name: 'PaymentScreen' },
            { selector: '.receipt-screen:not(.oe_hidden)', name: 'ReceiptScreen' }
        ];

        for (const mapping of screenMappings) {
            const element = document.querySelector(mapping.selector);
            if (element && element.offsetParent !== null) { // offsetParent is null for hidden elements
                return mapping.name;
            }
        }

        // Fallback: check visible screens by computed style
        const screens = document.querySelectorAll('.screen');
        for (const screen of screens) {
            const style = window.getComputedStyle(screen);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                if (screen.classList.contains('product-screen')) return 'ProductScreen';
                if (screen.classList.contains('payment-screen')) return 'PaymentScreen';
                if (screen.classList.contains('receipt-screen')) return 'ReceiptScreen';
            }
        }

        return 'Unknown';
    }

    /**
     * Safe navigation using button clicks instead of direct API calls
     */
    navigateToPayment() {
        // Look for the Payment button and click it
        const paymentButton = document.querySelector('.control-button .button.pay-button, .control-button[name="payment"], .pay-button, [data-action="payment"]');
        if (paymentButton) {
            paymentButton.click();
            return true;
        }

        // Fallback: look for any button with "pay" in text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('pay') || text.includes('payment')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    navigateToOrder() {
        // Look for back button, close button, or order button
        const backSelectors = [
            '.button.back',
            '.back-button',
            '[data-action="back"]',
            '.button.close',
            '.close-button',
            '.button.order',
            '.order-button'
        ];

        for (const selector of backSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null) {
                button.click();
                return true;
            }
        }

        // Fallback: look for buttons with back/close/order text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('back') || text.includes('close') || text.includes('order')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    validatePayment() {
        // Look for validate button
        const validateSelectors = [
            '.button.next',
            '.validate-button',
            '.button.validate',
            '[data-action="validate"]',
            '.payment-validate',
            '.button.confirm'
        ];

        for (const selector of validateSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null) {
                button.click();
                return true;
            }
        }

        // Fallback: look for buttons with validate/confirm text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('validate') || text.includes('confirm') || text.includes('finish')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    printReceipt() {
        // Look for print button first
        const printSelectors = [
            '.button.print',
            '.print-button',
            '.button.print-receipt',
            '[data-action="print"]',
            '.print-receipt-button',
            '.receipt-print'
        ];

        for (const selector of printSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null) {
                button.click();
                return true;
            }
        }

        // Fallback: look for buttons with print text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('print') && !text.includes('reprint')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    createNewOrder() {
        // Look for new order button
        const newOrderSelectors = [
            '.button.next',
            '.new-order-button',
            '.button.new-order',
            '[data-action="new-order"]',
            '.button.continue'
        ];

        for (const selector of newOrderSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null) {
                button.click();
                return true;
            }
        }

        // Fallback: look for buttons with new order text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('new order') || text.includes('continue') || text.includes('next')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    /**
     * Check if order has items and payment is complete
     */
    canNavigateFromOrder() {
        // Try to find orderlines in DOM
        const orderlines = document.querySelectorAll('.orderline, .order-line, .product-line');
        return orderlines.length > 0;
    }

    canNavigateFromPayment() {
        // Check if there's a validate button (indicates payment is ready)
        const validateButton = document.querySelector('.button.next, .validate-button, .button.validate');
        return validateButton && !validateButton.disabled;
    }

    handleKeydown(event) {
        // Skip if typing in inputs
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Skip if in popups
        if (event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover')) {
            return;
        }

        // Skip modifier keys
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
            return;
        }

        const currentScreen = this.getCurrentScreen();

        // Handle Enter key navigation
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.handleEnterKey(currentScreen);
            return false;
        }

        // Handle Backspace key (only Payment -> Order)
        if (event.key === 'Backspace' && currentScreen === 'PaymentScreen') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.handleBackspaceKey();
            return false;
        }
    }

    handleEnterKey(currentScreen) {
        switch (currentScreen) {
            case 'ProductScreen':
                if (this.canNavigateFromOrder()) {
                    this.navigateToPayment();
                }
                break;

            case 'PaymentScreen':
                if (this.canNavigateFromPayment()) {
                    this.validatePayment();
                }
                break;

            case 'ReceiptScreen':
                this.printReceipt();
                break;
        }
    }

    handleBackspaceKey() {
        this.navigateToOrder();
    }
}

// Global navigation manager instance
const safeNavigationManager = new SafeNavigationManager();

// ============================================================================
// PRICE FOCUS FUNCTIONALITY WITH FIXED MODE SWITCHING
// ============================================================================

// 2. Override PosStore to hijack automatic quantity mode settings
patch(PosStore.prototype, {

    /**
     * HIJACK: Replace automatic qty mode with price mode
     * COMPLETELY RESPECT user interactions - track ALL user activity
     */
    set numpadMode(mode) {
        const timeSinceManualClick = Date.now() - manualClickTime;
        const timeSinceUserInteraction = Date.now() - lastUserInteractionTime;
        const isRecentManualClick = isManualClick && timeSinceManualClick < 15000; // 15 seconds
        const isRecentUserActivity = timeSinceUserInteraction < 3000; // 3 seconds since ANY user action

        // If user manually selected a mode recently, ALWAYS respect it
        if (isRecentManualClick && lastManualMode) {
            this._numpadMode = lastManualMode;
            setTimeout(() => {
                this._updateModeVisuals();
            }, 50);
            return;
        }

        // If there's been recent user activity (clicking order lines, etc.), don't hijack
        if (isRecentUserActivity) {
            this._numpadMode = mode;
            setTimeout(() => {
                this._updateModeVisuals();
            }, 50);
            return;
        }

        // Only hijack if it's truly an automatic system change with no recent user activity
        if (mode === "quantity" && this._canUsePriceMode()) {
            this._numpadMode = "price";
        } else {
            this._numpadMode = mode;
        }

        setTimeout(() => {
            this._updateModeVisuals();
        }, 50);
    },

    /**
     * Override getter to prefer price mode but respect user activity
     */
    get numpadMode() {
        const timeSinceManualClick = Date.now() - manualClickTime;
        const timeSinceUserInteraction = Date.now() - lastUserInteractionTime;
        const isRecentManualClick = isManualClick && timeSinceManualClick < 15000;
        const isRecentUserActivity = timeSinceUserInteraction < 3000;

        // If user recently chose a mode, respect it
        if (isRecentManualClick && lastManualMode) {
            return lastManualMode;
        }

        // If there's recent user activity, return current mode without changing
        if (isRecentUserActivity && this._numpadMode) {
            return this._numpadMode;
        }

        // Otherwise prefer price mode if available
        if (this._canUsePriceMode() && !this._numpadMode) {
            return "price";
        }

        return this._numpadMode || "quantity";
    },

    /**
     * Update visual state of mode buttons
     */
    _updateModeVisuals() {
        const currentMode = this._numpadMode;

        const qtyBtn = document.querySelector('button[data-mode="quantity"]') ||
                      document.querySelector('button[value="Qty"]') ||
                      Array.from(document.querySelectorAll('button')).find(btn =>
                          btn.textContent.trim().toLowerCase() === 'qty'
                      );

        const priceBtn = document.querySelector('button[data-mode="price"]') ||
                        document.querySelector('button[value="Price"]') ||
                        Array.from(document.querySelectorAll('button')).find(btn =>
                            btn.textContent.trim().toLowerCase() === 'price'
                        );

        if (qtyBtn) {
            if (currentMode === "quantity") {
                qtyBtn.classList.add('active');
            } else {
                qtyBtn.classList.remove('active');
            }
        }

        if (priceBtn) {
            if (currentMode === "price") {
                priceBtn.classList.add('active');
            } else {
                priceBtn.classList.remove('active');
            }
        }
    },

    /**
     * Check if price mode is available
     */
    _canUsePriceMode() {
        try {
            return this.config &&
                   this.user &&
                   this.ready &&
                   typeof this.cashierHasPriceControlRights === 'function' &&
                   this.cashierHasPriceControlRights();
        } catch (e) {
            return false;
        }
    }
});

// 1. Override ActionPad to detect manual clicks
patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        onMounted(() => {
            this._interceptQtyButton();
            this._interceptPriceButton(); // Also intercept price button
            this._observeButtonChanges();
            this._trackAllUserInteractions(); // Track ALL user interactions

            // Initialize safe navigation
            safeNavigationManager.activate();
        });
    },

    /**
     * Watch for DOM changes to catch buttons when they're added
     */
    _observeButtonChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            const allButtons = node.querySelectorAll ? node.querySelectorAll('button') : [];
                            Array.from(allButtons).forEach(btn => {
                                const text = btn.textContent.trim().toLowerCase();
                                if ((text === 'qty' || text === 'quantity') && !btn._qtyIntercepted) {
                                    this._addQtyListener(btn);
                                }
                                if (text === 'price' && !btn._priceIntercepted) {
                                    this._addPriceListener(btn);
                                }
                            });

                            // No need to track order line clicks anymore - we're using a different approach
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this._buttonObserver = observer;
    },

    /**
     * Add click listener to qty button
     */
    _addQtyListener(qtyButton) {
        qtyButton._qtyIntercepted = true;

        qtyButton.addEventListener('click', (e) => {
            isManualClick = true;
            manualClickTime = Date.now();
            lastManualMode = "quantity";

            if (this.pos) {
                this.pos._numpadMode = "quantity";
            }

            setTimeout(() => {
                isManualClick = false;
                lastManualMode = null;
            }, 15000); // Extended to 15 seconds for better user experience
        });
    },

    /**
     * Add click listener to price button
     */
    _addPriceListener(priceButton) {
        priceButton._priceIntercepted = true;

        priceButton.addEventListener('click', (e) => {
            isManualClick = true;
            manualClickTime = Date.now();
            lastManualMode = "price";

            if (this.pos) {
                this.pos._numpadMode = "price";
            }

            setTimeout(() => {
                isManualClick = false;
                lastManualMode = null;
            }, 15000); // Extended to 15 seconds for better user experience
        });
    },

    /**
     * Find and intercept qty button clicks
     */
    _interceptQtyButton() {
        const searchAttempts = [100, 500, 1000, 2000, 3000];

        searchAttempts.forEach(delay => {
            setTimeout(() => {
                this._findAndInterceptQtyButton();
            }, delay);
        });
    },

    /**
     * Find and intercept price button clicks
     */
    _interceptPriceButton() {
        const searchAttempts = [100, 500, 1000, 2000, 3000];

        searchAttempts.forEach(delay => {
            setTimeout(() => {
                this._findAndInterceptPriceButton();
            }, delay);
        });
    },

    /**
     * Find qty button using multiple search strategies
     */
    _findAndInterceptQtyButton() {
        let qtyButton = document.querySelector('button[data-mode="quantity"]');

        if (!qtyButton) {
            qtyButton = document.querySelector('button[value="Qty"]');
        }

        if (!qtyButton) {
            qtyButton = document.querySelector('button.numpad-qty');
        }

        if (!qtyButton) {
            const allButtons = document.querySelectorAll('button');
            qtyButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.trim().toLowerCase();
                return text === 'qty' || text === 'quantity';
            });
        }

        if (!qtyButton) {
            const actionPad = document.querySelector('.actionpad, .action-pad, .numpad-buttons');
            if (actionPad) {
                const buttons = actionPad.querySelectorAll('button');
                qtyButton = Array.from(buttons).find(btn => {
                    const text = btn.textContent.trim().toLowerCase();
                    return text === 'qty' || text === 'quantity';
                });
            }
        }

        if (qtyButton && !qtyButton._qtyIntercepted) {
            this._addQtyListener(qtyButton);
        }
    },

    /**
     * Find and intercept price button
     */
    _findAndInterceptPriceButton() {
        let priceButton = document.querySelector('button[data-mode="price"]');

        if (!priceButton) {
            priceButton = document.querySelector('button[value="Price"]');
        }

        if (!priceButton) {
            const allButtons = document.querySelectorAll('button');
            priceButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.trim().toLowerCase();
                return text === 'price';
            });
        }

        if (priceButton && !priceButton._priceIntercepted) {
            this._addPriceListener(priceButton);
        }
    },

    /**
     * Track ALL user interactions to prevent mode hijacking during any user activity
     */
    _trackAllUserInteractions() {
        // Track clicks on the entire document
        document.addEventListener('click', () => {
            lastUserInteractionTime = Date.now();
        }, { capture: true });

        // Track keyboard activity
        document.addEventListener('keydown', () => {
            lastUserInteractionTime = Date.now();
        }, { capture: true });

        // Track touch events for mobile
        document.addEventListener('touchstart', () => {
            lastUserInteractionTime = Date.now();
        }, { capture: true });

        // Track mouse movement (less aggressive, only when actually moving)
        let mouseTimer;
        document.addEventListener('mousemove', () => {
            clearTimeout(mouseTimer);
            mouseTimer = setTimeout(() => {
                lastUserInteractionTime = Date.now();
            }, 100); // Debounce mouse movement
        });
    }
});

// ProductScreen with keyboard shortcuts
patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        this.addKeyboardListener();
    },

    /**
     * Add keyboard shortcuts for quantity changes
     */
    addKeyboardListener() {
        // Track last event to prevent duplicates
        let lastEventTime = 0;
        let lastEventKey = '';

        const handleArrowKeys = (event) => {
            // Only process arrow keys and +/-
            if (!['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                return;
            }

            // Debounce: prevent duplicate events within 100ms
            const now = Date.now();
            if (now - lastEventTime < 100 && lastEventKey === event.key) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return false;
            }
            lastEventTime = now;
            lastEventKey = event.key;

            // Skip if typing in inputs
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // Get the current order and find selected line or use the last line
            const order = this.pos?.get_order?.();
            if (!order) return;

            let targetLine = order.get_selected_orderline();

            // If no line is selected, use the last/newest line
            if (!targetLine) {
                const orderlines = order.get_orderlines();
                if (orderlines && orderlines.length > 0) {
                    targetLine = orderlines[orderlines.length - 1];
                    order.select_orderline(targetLine);
                }
            }

            if (!targetLine) return;

            // Block other handlers
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Calculate new quantity
            const currentQty = targetLine.get_quantity();
            let newQty;

            if (event.key === 'ArrowUp' || event.key === '+') {
                newQty = currentQty + 1;
            } else if (event.key === 'ArrowDown' || event.key === '-') {
                newQty = Math.max(0, currentQty - 1);
            }

            // Set quantity
            try {
                targetLine.set_quantity(newQty);
            } catch (error) {
                // Silently handle errors
            }

            return false;
        };

        document.addEventListener('keydown', handleArrowKeys, {
            capture: true,
            passive: false
        });

        setTimeout(() => {
            this._overrideOdooNumpadHandlers();
        }, 1000);
    },

    /**
     * Override Odoo's numpad-specific keyboard handling
     */
    _overrideOdooNumpadHandlers() {
        const numpadElement = document.querySelector('.numpad, .actionpad');
        if (numpadElement) {
            const originalKeydown = numpadElement.onkeydown;
            const originalKeyup = numpadElement.onkeyup;

            numpadElement.onkeydown = (event) => {
                if (['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                    return false;
                }
                if (originalKeydown) {
                    return originalKeydown.call(numpadElement, event);
                }
            };

            numpadElement.onkeyup = (event) => {
                if (['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                    return false;
                }
                if (originalKeyup) {
                    return originalKeyup.call(numpadElement, event);
                }
            };
        }
    }
});

console.log('Kuwait Retail POS: Navigation + Price Focus loaded');