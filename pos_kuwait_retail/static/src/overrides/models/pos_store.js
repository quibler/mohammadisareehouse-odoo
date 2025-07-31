/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

/**
 * SIMPLIFIED MODE MANAGEMENT FOR pos_kuwait_retail
 *
 * Core principle: Once user manually selects a mode, respect it completely
 * Default to price mode when no manual selection has been made
 *
 * This replaces the complex timing-based logic with a simple, predictable approach
 */

// Simple state management - only track what we need
class ModeManager {
    constructor() {
        this.userSelectedMode = null;  // null = no manual selection, "price"|"quantity"|"discount" = user choice
    }

    setManualMode(mode) {
        this.userSelectedMode = mode;
        console.log(`User manually selected mode: ${mode}`);
    }

    getDesiredMode(systemRequestedMode, canUsePrice) {
        // If user has manually selected a mode, always use it
        if (this.userSelectedMode) {
            return this.userSelectedMode;
        }

        // If no manual selection and price mode is available, default to price
        if (canUsePrice) {
            return "price";
        }

        // Fallback to system requested mode or quantity
        return systemRequestedMode || "quantity";
    }

    reset() {
        this.userSelectedMode = null;
    }
}

// Global instance
const modeManager = new ModeManager();

// ============================================================================
// SAFE NAVIGATION FUNCTIONALITY (keeping existing keyboard shortcuts)
// ============================================================================

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

    getCurrentScreen() {
        const screenMappings = [
            { selector: '.product-screen:not(.oe_hidden)', name: 'ProductScreen' },
            { selector: '.payment-screen:not(.oe_hidden)', name: 'PaymentScreen' },
            { selector: '.receipt-screen:not(.oe_hidden)', name: 'ReceiptScreen' }
        ];

        for (const mapping of screenMappings) {
            const element = document.querySelector(mapping.selector);
            if (element && element.offsetParent !== null) {
                return mapping.name;
            }
        }

        return 'ProductScreen'; // Default fallback
    }

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

        // Fallback: look for buttons with back text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('back') && !text.includes('reprint')) {
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
            '[data-action="validate"]'
        ];

        for (const selector of validateSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null && !button.disabled) {
                button.click();
                return true;
            }
        }

        // Fallback: look for buttons with validate/confirm text
        const buttons = document.querySelectorAll('button, .button');
        for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            if ((text.includes('validate') || text.includes('confirm'))
                && !text.includes('reprint')) {
                button.click();
                return true;
            }
        }

        return false;
    }

    printReceipt() {
        // Look for print button
        const printSelectors = [
            '.button.next',
            '.print-button',
            '.button.print',
            '[data-action="print"]'
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
// SIMPLIFIED MODE MANAGEMENT - CORE FUNCTIONALITY
// ============================================================================

// Override PosStore with simplified, predictable logic
patch(PosStore.prototype, {

    set numpadMode(mode) {
        const desiredMode = modeManager.getDesiredMode(mode, this._canUsePriceMode());
        this._numpadMode = desiredMode;

        // Update UI to reflect the actual mode
        setTimeout(() => {
            this._updateModeVisuals();
        }, 50);
    },

    get numpadMode() {
        // Always return the current mode, but ensure it matches user preference
        const desiredMode = modeManager.getDesiredMode(this._numpadMode, this._canUsePriceMode());

        // If desired mode differs from current, update it
        if (this._numpadMode !== desiredMode) {
            this._numpadMode = desiredMode;
            setTimeout(() => {
                this._updateModeVisuals();
            }, 50);
        }

        return this._numpadMode;
    },

    /**
     * Update visual state of mode buttons
     */
    _updateModeVisuals() {
        const currentMode = this._numpadMode;

        // Update quantity button
        const qtyBtn = this._findButton(["quantity", "qty"]);
        if (qtyBtn) {
            qtyBtn.classList.toggle('active', currentMode === "quantity");
        }

        // Update price button
        const priceBtn = this._findButton(["price"]);
        if (priceBtn) {
            priceBtn.classList.toggle('active', currentMode === "price");
        }

        // Update discount button
        const discountBtn = this._findButton(["discount", "%"]);
        if (discountBtn) {
            discountBtn.classList.toggle('active', currentMode === "discount");
        }
    },

    /**
     * Simplified button finder - searches all common patterns
     */
    _findButton(textOptions) {
        // Try data-mode first
        for (let option of textOptions) {
            let btn = document.querySelector(`button[data-mode="${option}"]`);
            if (btn) return btn;
        }

        // Try value attribute
        for (let option of textOptions) {
            let btn = document.querySelector(`button[value="${option}"]`);
            if (btn) return btn;
        }

        // Try text content (case insensitive)
        const allButtons = document.querySelectorAll('button');
        for (let btn of allButtons) {
            const text = btn.textContent.trim().toLowerCase();
            if (textOptions.some(option => text === option.toLowerCase())) {
                return btn;
            }
        }

        return null;
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

// ============================================================================
// ACTIONPAD PATCH - SIMPLIFIED BUTTON HANDLING
// ============================================================================

patch(ActionpadWidget.prototype, {
    setup() {
        super.setup();

        onMounted(() => {
            this._setupModeButtons();
            // Initialize safe navigation
            safeNavigationManager.activate();
        });
    },

    /**
     * Set up event listeners for all mode buttons
     */
    _setupModeButtons() {
        // Setup with retries to handle dynamic button creation
        const setupAttempts = [0, 100, 500, 1000, 2000];

        setupAttempts.forEach(delay => {
            setTimeout(() => {
                this._attachButtonListeners();
            }, delay);
        });

        // Also watch for DOM changes to catch dynamically added buttons
        const observer = new MutationObserver(() => {
            this._attachButtonListeners();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    /**
     * Attach click listeners to mode buttons - SINGLE CLICK GUARANTEED
     */
    _attachButtonListeners() {
        // Quantity button
        const qtyBtn = this.pos._findButton(["quantity", "qty"]);
        if (qtyBtn && !qtyBtn._modeListenerAttached) {
            qtyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                modeManager.setManualMode("quantity");
                this.pos._numpadMode = "quantity";
                this.pos._updateModeVisuals();
            });
            qtyBtn._modeListenerAttached = true;
        }

        // Price button
        const priceBtn = this.pos._findButton(["price"]);
        if (priceBtn && !priceBtn._modeListenerAttached) {
            priceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                modeManager.setManualMode("price");
                this.pos._numpadMode = "price";
                this.pos._updateModeVisuals();
            });
            priceBtn._modeListenerAttached = true;
        }

        // Discount button (% button)
        const discountBtn = this.pos._findButton(["discount", "%"]);
        if (discountBtn && !discountBtn._modeListenerAttached) {
            discountBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                modeManager.setManualMode("discount");
                this.pos._numpadMode = "discount";
                this.pos._updateModeVisuals();
            });
            discountBtn._modeListenerAttached = true;
        }
    }
});

// ============================================================================
// PRODUCT SCREEN - ARROW KEYS RESTRICTED TO ORDER SCREEN ONLY
// ============================================================================

patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.addKeyboardListener();
    },

    /**
     * Check if we're currently on the ProductScreen (order screen)
     */
    isOnOrderScreen() {
        // Check if we're on the product screen (order screen)
        const productScreen = document.querySelector('.product-screen:not(.oe_hidden)');
        return productScreen && productScreen.offsetParent !== null;
    },

    /**
     * Add keyboard shortcuts for quantity changes - ONLY ON ORDER SCREEN
     */
    addKeyboardListener() {
        let lastEventTime = 0;
        let lastEventKey = '';

        const handleArrowKeys = (event) => {
            // CRITICAL FIX: Only handle arrow keys on ProductScreen (order screen)
            if (!this.isOnOrderScreen()) {
                return;
            }

            if (!['ArrowUp', 'ArrowDown', '+', '-'].includes(event.key)) {
                return;
            }

            const now = Date.now();
            if (now - lastEventTime < 100 && lastEventKey === event.key) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return false;
            }
            lastEventTime = now;
            lastEventKey = event.key;

            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            const order = this.pos?.get_order?.();
            if (!order) return;

            const selectedLine = order.get_selected_orderline();
            const orderlines = order.get_orderlines();
            const targetLine = selectedLine || orderlines[orderlines.length - 1];

            if (!targetLine) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const currentQty = targetLine.get_quantity();
            let newQty = currentQty;

            switch (event.key) {
                case 'ArrowUp':
                case '+':
                    newQty = currentQty + 1;
                    break;
                case 'ArrowDown':
                case '-':
                    newQty = Math.max(0, currentQty - 1);
                    break;
            }

            if (newQty !== currentQty) {
                if (newQty === 0) {
                    order.removeOrderline(targetLine);
                } else {
                    targetLine.set_quantity(newQty);
                }
            }

            return false;
        };

        document.addEventListener('keydown', handleArrowKeys, { capture: true, passive: false });
    }
});

// Optional: Reset mode selection when starting a new order
patch(PosStore.prototype, {
    add_new_order() {
        const result = super.add_new_order();

        // Uncomment the next line if you want mode to reset for each new order
        // modeManager.reset();

        return result;
    }
});