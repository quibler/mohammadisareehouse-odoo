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
                this.createNewOrder();
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
// RESTORE PRICE FOCUS FUNCTIONALITY
// ============================================================================

// 2. Override PosStore to hijack automatic quantity mode settings
patch(PosStore.prototype, {

    /**
     * HIJACK: Replace all automatic qty mode with price mode
     * EXCEPT when user manually clicks qty button
     */
    set numpadMode(mode) {
        const timeSinceManualClick = Date.now() - manualClickTime;
        const isRecentManualClick = isManualClick && timeSinceManualClick < 3000;

        if (mode === "quantity") {
            if (isRecentManualClick) {
                this._numpadMode = "quantity";
            } else if (this._canUsePriceMode()) {
                this._numpadMode = "price";
            } else {
                this._numpadMode = "quantity";
            }
        } else {
            if (isRecentManualClick && this._numpadMode === "quantity") {
                // Don't change from quantity if user just clicked qty button
            } else {
                this._numpadMode = mode;
            }
        }

        setTimeout(() => {
            this._updateModeVisuals();
        }, 50);
    },

    /**
     * Override getter to default to price
     */
    get numpadMode() {
        if (!this._numpadMode && this._canUsePriceMode()) {
            this._numpadMode = "price";
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

// 1. Override ActionPad to detect manual clicks AND restore price focus
patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        onMounted(() => {
            this._interceptQtyButton();
            this._observeButtonChanges();

            // Initialize safe navigation
            safeNavigationManager.activate();
        });
    },

    /**
     * Watch for DOM changes to catch qty button when it's added
     */
    _observeButtonChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            // Original qty button detection for price focus
                            const buttons = node.querySelectorAll ?
                                node.querySelectorAll('.mode-button[data-mode="quantity"]') : [];
                            buttons.forEach(btn => this._interceptButton(btn));

                            // Enhanced qty button detection
                            const allButtons = node.querySelectorAll ? node.querySelectorAll('button') : [];
                            Array.from(allButtons).forEach(btn => {
                                const text = btn.textContent.trim().toLowerCase();
                                if ((text === 'qty' || text === 'quantity') && !btn._qtyIntercepted) {
                                    this._addQtyListener(btn);
                                }
                            });
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
     * Add click listener to qty button (for price focus)
     */
    _addQtyListener(qtyButton) {
        qtyButton._qtyIntercepted = true;

        qtyButton.addEventListener('click', (e) => {
            isManualClick = true;
            manualClickTime = Date.now();

            if (this.pos) {
                this.pos._numpadMode = "quantity";
            }

            setTimeout(() => {
                isManualClick = false;
            }, 3000);
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
     * Find and intercept qty button clicks
     */
    _interceptQtyButton() {
        const qtyButton = document.querySelector('.mode-button[data-mode="quantity"]');
        if (qtyButton) {
            this._interceptButton(qtyButton);
        }
    },

    /**
     * Add click interceptor to button
     */
    _interceptButton(button) {
        if (button._posIntercepted) return;
        button._posIntercepted = true;

        button.addEventListener('click', () => {
            isManualClick = true;
            manualClickTime = Date.now();

            // Clear the flag after a delay
            setTimeout(() => {
                isManualClick = false;
            }, 2000);
        }, { capture: true });
    }
});

// ProductScreen with keyboard shortcuts (keeping existing quantity functionality)
patch(ProductScreen.prototype, {

    setup() {
        super.setup();
        this.addKeyboardListener();
    },

    /**
     * Add keyboard shortcuts for quantity changes ONLY
     * Navigation is handled by the SafeNavigationManager
     */
    addKeyboardListener() {
        // Track last event to prevent duplicates
        let lastEventTime = 0;
        let lastEventKey = '';

        const handleArrowKeys = (event) => {
            // Only process arrow keys and +/- (let SafeNavigationManager handle Enter/Backspace)
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

        // Use lower priority for arrow keys only
        document.addEventListener('keydown', handleArrowKeys, {
            capture: false,
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