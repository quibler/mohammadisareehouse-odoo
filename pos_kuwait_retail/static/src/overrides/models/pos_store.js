/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

/**
 * OPTIMIZED POS NAVIGATION - Kuwait Retail
 *
 * Product Screen: Arrow keys for quantity, Arrow Right to Payment
 * Payment Screen: Arrow Left/Right for navigation only
 * Receipt Screen: Enter to print, default Odoo behavior otherwise
 */

// Simple mode management
class ModeManager {
    constructor() {
        this.userSelectedMode = null;
    }

    setManualMode(mode) {
        this.userSelectedMode = mode;
    }

    getDesiredMode(systemRequestedMode, canUsePrice) {
        if (this.userSelectedMode) {
            return this.userSelectedMode;
        }
        return canUsePrice ? "price" : systemRequestedMode || "quantity";
    }

    reset() {
        this.userSelectedMode = null;
    }
}

const modeManager = new ModeManager();

// Minimal navigation manager
class NavigationManager {
    constructor() {
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    activate() {
        document.addEventListener('keydown', this.handleKeydown, { passive: false });
    }

    handleKeydown(event) {
        // Skip if typing in inputs or popups
        if (event.target.tagName === 'INPUT' ||
            event.target.tagName === 'TEXTAREA' ||
            event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover') ||
            event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
            return;
        }

        const currentScreen = this.getCurrentScreen();

        // Payment Screen: Only Left/Right arrows
        if (currentScreen === 'PaymentScreen') {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                this.goToOrder();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                this.validatePayment();
            }
        }
        // Receipt Screen: Only Enter key
        else if (currentScreen === 'ReceiptScreen') {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.printReceipt();
            }
        }
    }

    getCurrentScreen() {
        if (document.querySelector('.payment-screen:not(.oe_hidden)')?.offsetParent) return 'PaymentScreen';
        if (document.querySelector('.receipt-screen:not(.oe_hidden)')?.offsetParent) return 'ReceiptScreen';
        return 'ProductScreen';
    }

    goToOrder() {
        const backBtn = document.querySelector('.button.back, .back-button, [data-action="back"]');
        if (backBtn?.offsetParent) {
            backBtn.click();
        }
    }

    validatePayment() {
        const validateBtn = document.querySelector('.button.next, .validate-button, .button.validate');
        if (validateBtn?.offsetParent && !validateBtn.disabled) {
            validateBtn.click();
        }
    }

    printReceipt() {
        const printBtn = document.querySelector('.print-button, .button.print, [data-action="print"]');
        if (printBtn?.offsetParent) {
            printBtn.click();
        }
    }
}

const navigationManager = new NavigationManager();

// Enhanced ProductScreen patch with order change detection
patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.addQuantityControls();
        this.addPaymentNavigation();
        this.watchForOrderChanges();
    },

    // Watch for order changes to trigger button attachment
    watchForOrderChanges() {
        // Trigger button attachment when order lines change
        const originalAddLineToCurrentOrder = this.pos.addLineToCurrentOrder;
        this.pos.addLineToCurrentOrder = (...args) => {
            const result = originalAddLineToCurrentOrder.call(this.pos, ...args);
            setTimeout(() => this.pos._attachOnOrderChange(), 100);
            return result;
        };
    },

    addQuantityControls() {
        document.addEventListener('keydown', (event) => {
            // Only on Product Screen
            if (!document.querySelector('.product-screen:not(.oe_hidden)')?.offsetParent) return;

            // Skip if in inputs/popups
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' ||
                event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover')) return;

            const order = this.pos?.get_order?.();
            if (!order) return;

            const targetLine = order.get_selected_orderline() || order.get_orderlines().slice(-1)[0];
            if (!targetLine) return;

            let handled = false;
            const currentQty = targetLine.get_quantity();

            switch (event.key) {
                case 'ArrowUp':
                case '+':
                    targetLine.set_quantity(currentQty + 1);
                    handled = true;
                    break;
                case 'ArrowDown':
                case '-':
                    const newQty = Math.max(0, currentQty - 1);
                    if (newQty === 0) {
                        order.removeOrderline(targetLine);
                    } else {
                        targetLine.set_quantity(newQty);
                    }
                    handled = true;
                    break;
                case 'Delete':
                    order.removeOrderline(targetLine);
                    handled = true;
                    break;
            }

            if (handled) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, { passive: false });
    },

    addPaymentNavigation() {
        document.addEventListener('keydown', (event) => {
            // Only on Product Screen
            if (!document.querySelector('.product-screen:not(.oe_hidden)')?.offsetParent) return;

            // Only Arrow Right
            if (event.key !== 'ArrowRight') return;

            // Skip if in inputs/popups
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' ||
                event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover')) return;

            // Check if order has items
            const order = this.pos?.get_order?.();
            if (!order?.get_orderlines()?.length) return;

            // Go to payment
            const payBtn = document.querySelector('.control-button .pay-button, .pay-button, [data-action="payment"]') ||
                         [...document.querySelectorAll('button, .button')].find(btn =>
                           btn.textContent?.toLowerCase().includes('pay'));

            if (payBtn?.offsetParent) {
                event.preventDefault();
                payBtn.click();
            }
        }, { passive: false });
    }
});

// Streamlined mode management - UNCHANGED to preserve existing functionality
patch(PosStore.prototype, {
    set numpadMode(mode) {
        this._numpadMode = modeManager.getDesiredMode(mode, this._canUsePriceMode());
        setTimeout(() => this._updateModeVisuals(), 50);
    },

    get numpadMode() {
        const desired = modeManager.getDesiredMode(this._numpadMode, this._canUsePriceMode());
        if (this._numpadMode !== desired) {
            this._numpadMode = desired;
            setTimeout(() => this._updateModeVisuals(), 50);
        }
        return this._numpadMode;
    },

    _updateModeVisuals() {
        const mode = this._numpadMode;

        // Use the helper function for all button updates
        this._toggleButton(["qty", "quantity"], mode === "quantity");
        this._toggleButton(["price"], mode === "price");
        // TARGETED FIX: Only update % button in numpad, not control buttons
        this._toggleNumpadButton(["%"], mode === "discount");

        // Update the data attribute on the main container for CSS targeting
        const posContent = document.querySelector('.pos-content') || document.body;
        if (posContent) {
            posContent.setAttribute('data-numpad-mode', mode);
        }
    },

    _toggleButton(terms, active) {
        const btn = this._findButton(terms);
        if (btn) {
            btn.classList.toggle('active', active);
            btn.setAttribute('data-mode-active', active);
        }
    },

    // NEW: Specific method to only toggle numpad buttons, not control buttons
    _toggleNumpadButton(terms, active) {
        const numpadArea = document.querySelector('.numpad');
        if (!numpadArea) return;

        for (const term of terms) {
            const btn = numpadArea.querySelector(`button[value="${term}"]`);
            if (btn) {
                btn.classList.toggle('active', active);
                btn.setAttribute('data-mode-active', active);
            }
        }
    },

    _canUsePriceMode() {
        const order = this.get_order();
        return order?.get_selected_orderline() || order?.get_orderlines()?.length > 0;
    },

    _findButton(searchTerms) {
        // Search in multiple areas where mode buttons might be located
        const searchAreas = [
            document, // Global search first
            document.querySelector('.numpad'),
            document.querySelector('.subpads'),
            document.querySelector('.pads'),
            document.querySelector('.actionpad'),
            document.querySelector('.o_numpad'),
            document.querySelector('.control-buttons'),
            document.querySelector('.leftpane'),
            document.querySelector('.rightpane')
        ].filter(Boolean); // Remove null values

        for (const area of searchAreas) {
            for (const term of searchTerms) {
                // Try multiple selectors for each term
                const selectors = [
                    `button[value="${term}"]`,
                    `button[data-mode="${term}"]`,
                    `button.${term}`,
                    `button.numpad-${term}`,
                    `.${term} button`,
                    `.numpad-${term}`
                ];

                for (const selector of selectors) {
                    try {
                        const btn = area.querySelector(selector);
                        if (btn) return btn;
                    } catch (e) {
                        // Invalid selector, continue
                    }
                }

                // Text-based search as fallback
                const buttons = area.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.textContent?.trim().toLowerCase();
                    const value = btn.getAttribute('value')?.toLowerCase();
                    const className = btn.className.toLowerCase();

                    if (text === term.toLowerCase() ||
                        value === term.toLowerCase() ||
                        className.includes(term.toLowerCase())) {
                        return btn;
                    }
                }
            }
        }
        return null;
    },

    // TARGETED FIX: Only attach listeners to specific numpad buttons
    _attachButtonListeners() {
        const tryAttach = (delay) => {
            setTimeout(() => {
                this._attachModeListener(["qty", "quantity"], "quantity");
                this._attachModeListener(["price"], "price");
                // TARGETED: Only attach to % button in numpad, not control buttons
                this._attachNumpadModeListener(["%"], "discount");
            }, delay);
        };

        // Try at multiple intervals
        tryAttach(100);
        tryAttach(500);
        tryAttach(1000);
        tryAttach(2000);
        tryAttach(5000);
    },

    // Also attach when order changes (numpad appears)
    _attachOnOrderChange() {
        const tryAttachNumpad = () => {
            this._attachModeListener(["qty", "quantity"], "quantity");
            this._attachModeListener(["price"], "price");
            // TARGETED: Only attach to % button in numpad
            this._attachNumpadModeListener(["%"], "discount");
        };

        setTimeout(tryAttachNumpad, 100);
        setTimeout(tryAttachNumpad, 500);
    },

    // UNCHANGED: Regular mode listener for Qty and Price buttons
    _attachModeListener(terms, mode) {
        // Find button using the enhanced search method
        let btn = this._findButton(terms);

        if (btn && !btn._modeListenerAttached) {
            // Regular click handler for non-discount buttons
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();

                modeManager.setManualMode(mode);
                this.numpadMode = mode;
                this._updateModeVisuals();
            };

            btn.addEventListener('click', clickHandler, true);
            btn._modeListenerAttached = true;
            btn._clickHandler = clickHandler;
        }
    },

    // NEW: Specific method for ONLY numpad % button to avoid interference
    _attachNumpadModeListener(terms, mode) {
        const numpadArea = document.querySelector('.numpad');
        if (!numpadArea) {
            return;
        }

        for (const term of terms) {
            // TARGETED: Only look for % button inside .numpad area
            const btn = numpadArea.querySelector(`button[value="${term}"]`);

            if (btn && !btn._numpadModeListenerAttached) {
                // TARGETED: Click handler only for numpad % button
                const clickHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    modeManager.setManualMode(mode);
                    this.numpadMode = mode;
                    this._updateModeVisuals();
                };

                btn.addEventListener('click', clickHandler, true);
                btn._numpadModeListenerAttached = true;
                btn._numpadClickHandler = clickHandler;
            }
        }
    }
});

// Initialize - with better timing and order change detection
patch(ActionpadWidget.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            navigationManager.activate();

            // Store reference to POS for global access (use the correct object)
            window.pos = this.pos;
            window.posmodel = this.pos; // Also store as posmodel for consistency

            setTimeout(() => {
                this.pos._attachButtonListeners();
            }, 500);

            // Also try when DOM changes occur
            const observer = new MutationObserver(() => {
                this.pos._attachOnOrderChange();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // TARGETED % BUTTON ATTACHMENT - only look in .numpad area
            const attachNumpadButtons = () => {
                const numpadArea = document.querySelector('.numpad');
                if (numpadArea) {
                    const percentBtn = numpadArea.querySelector('button[value="%"]');
                    const qtyBtn = numpadArea.querySelector('button[value="Qty"]');
                    const priceBtn = numpadArea.querySelector('button[value="Price"]');

                    if (percentBtn && !percentBtn._enhanced_listener_attached) {
                        this._attachEnhancedNumpadModeListener(percentBtn, "discount");
                    }
                    if (qtyBtn && !qtyBtn._enhanced_listener_attached) {
                        this._attachEnhancedNumpadModeListener(qtyBtn, "quantity");
                    }
                    if (priceBtn && !priceBtn._enhanced_listener_attached) {
                        this._attachEnhancedNumpadModeListener(priceBtn, "price");
                    }
                }
            };

            // Enhanced numpad mode listener with proper mode change
            this._attachEnhancedNumpadModeListener = (btn, mode) => {
                if (btn && !btn._enhanced_listener_attached) {
                    const enhancedHandler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Set manual mode
                        modeManager.setManualMode(mode);

                        // Update POS mode properly
                        if (window.posmodel) {
                            window.posmodel.numpadMode = mode;
                        }
                    };

                    // Add event listeners with high priority
                    btn.addEventListener('click', enhancedHandler, true);
                    btn.addEventListener('mousedown', enhancedHandler, true);
                    btn._enhanced_listener_attached = true;
                    btn._enhanced_handler = enhancedHandler;
                }
            };

            setInterval(attachNumpadButtons, 2000); // Try every 2 seconds
        });
    }
});

// Receipt Screen: Auto-print if configured
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            if (this.pos.config.iface_print_auto) {
                setTimeout(() => navigationManager.printReceipt(), 1000);
            }
        });
    }
});