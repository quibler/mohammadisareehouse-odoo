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

// Navigation logic is now handled directly in ProductScreen patch

// Enhanced ProductScreen patch - simplified single event listener
patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.initializeKeyboardHandling();
        this.watchForOrderChanges();
    },

    // Watch for order changes to trigger button attachment
    watchForOrderChanges() {
        const originalAddLineToCurrentOrder = this.pos.addLineToCurrentOrder;
        this.pos.addLineToCurrentOrder = (...args) => {
            const result = originalAddLineToCurrentOrder.call(this.pos, ...args);
            setTimeout(() => this.pos._attachOnOrderChange(), 100);
            return result;
        };
    },

    initializeKeyboardHandling() {
        // Ensure only one event listener exists globally
        if (document._posKeyboardHandler) {
            document.removeEventListener('keydown', document._posKeyboardHandler);
        }

        const handler = (event) => {
            // Skip if in inputs/popups or with modifier keys
            if (event.target.tagName === 'INPUT' || 
                event.target.tagName === 'TEXTAREA' ||
                event.target.closest('.modal, .popup, .dialog, .dropdown-menu, .o_popover') ||
                event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
                return;
            }

            const currentScreen = this.getCurrentScreen();
            
            if (currentScreen === 'ProductScreen') {
                this.handleProductScreenKeys(event);
            } else if (currentScreen === 'PaymentScreen') {
                this.handlePaymentScreenKeys(event);
            } else if (currentScreen === 'ReceiptScreen') {
                this.handleReceiptScreenKeys(event);
            }
        };

        document.addEventListener('keydown', handler, { passive: false });
        document._posKeyboardHandler = handler;
    },

    getCurrentScreen() {
        if (document.querySelector('.payment-screen:not(.oe_hidden)')?.offsetParent) return 'PaymentScreen';
        if (document.querySelector('.receipt-screen:not(.oe_hidden)')?.offsetParent) return 'ReceiptScreen';
        if (document.querySelector('.product-screen:not(.oe_hidden)')?.offsetParent) return 'ProductScreen';
        return null;
    },

    handleProductScreenKeys(event) {
        const order = this.pos?.get_order?.();
        if (!order) return;

        let handled = false;

        switch (event.key) {
            case 'ArrowUp':
            case '+':
                const targetLineUp = order.get_selected_orderline() || order.get_orderlines().slice(-1)[0];
                if (targetLineUp) {
                    targetLineUp.set_quantity(targetLineUp.get_quantity() + 1);
                    handled = true;
                }
                break;
            
            case 'ArrowDown':
            case '-':
                const targetLineDown = order.get_selected_orderline() || order.get_orderlines().slice(-1)[0];
                if (targetLineDown) {
                    const newQty = Math.max(0, targetLineDown.get_quantity() - 1);
                    if (newQty === 0) {
                        order.removeOrderline(targetLineDown);
                    } else {
                        targetLineDown.set_quantity(newQty);
                    }
                    handled = true;
                }
                break;
            
            case 'ArrowRight':
                if (order.get_orderlines()?.length > 0) {
                    const payBtn = document.querySelector('.control-button .pay-button, .pay-button') ||
                                 [...document.querySelectorAll('button')].find(btn =>
                                   btn.textContent?.toLowerCase().includes('pay'));
                    if (payBtn?.offsetParent) {
                        payBtn.click();
                        handled = true;
                    }
                }
                break;
            
            case 'Delete':
                const targetLineDelete = order.get_selected_orderline() || order.get_orderlines().slice(-1)[0];
                if (targetLineDelete) {
                    order.removeOrderline(targetLineDelete);
                    handled = true;
                }
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    },

    handlePaymentScreenKeys(event) {
        let handled = false;
        
        switch (event.key) {
            case 'ArrowLeft':
                const backBtn = document.querySelector('.button.back, .back-button');
                if (backBtn?.offsetParent) {
                    backBtn.click();
                    handled = true;
                }
                break;
            
            case 'ArrowRight':
                const validateBtn = document.querySelector('.button.next, .validate-button, .button.validate');
                if (validateBtn?.offsetParent && !validateBtn.disabled) {
                    validateBtn.click();
                    handled = true;
                }
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    },

    handleReceiptScreenKeys(event) {
        if (event.key === 'Enter') {
            const printBtn = document.querySelector('.print-button, .button.print');
            if (printBtn?.offsetParent) {
                printBtn.click();
                event.preventDefault();
                event.stopPropagation();
            }
        }
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
                // Don't prevent default - let Odoo handle input clearing
                modeManager.setManualMode(mode);
                this._numpadMode = mode;
                this._updateModeVisuals();
            };

            btn.addEventListener('click', clickHandler, false);
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
                    // Don't prevent default - let Odoo handle input clearing
                    modeManager.setManualMode(mode);
                    this._numpadMode = mode;
                    this._updateModeVisuals();
                };

                btn.addEventListener('click', clickHandler, false);
                btn._numpadModeListenerAttached = true;
                btn._numpadClickHandler = clickHandler;
            }
        }
    }
});

// Initialize - simplified
patch(ActionpadWidget.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            // Store reference to POS for global access
            window.pos = this.pos;
            window.posmodel = this.pos;

            setTimeout(() => {
                this.pos._attachButtonListeners();
            }, 500);

            // Try when DOM changes occur
            const observer = new MutationObserver(() => {
                this.pos._attachOnOrderChange();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Attach numpad buttons
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

            this._attachEnhancedNumpadModeListener = (btn, mode) => {
                if (btn && !btn._enhanced_listener_attached) {
                    const enhancedHandler = (e) => {
                        // Don't prevent default - let Odoo handle input clearing
                        modeManager.setManualMode(mode);
                        if (window.posmodel) {
                            window.posmodel._numpadMode = mode;
                        }
                    };

                    btn.addEventListener('click', enhancedHandler, false);
                    btn.addEventListener('mousedown', enhancedHandler, false);
                    btn._enhanced_listener_attached = true;
                    btn._enhanced_handler = enhancedHandler;
                }
            };

            setInterval(attachNumpadButtons, 2000);
        });
    }
});

// Receipt Screen: Auto-print if configured
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            if (this.pos.config.iface_print_auto) {
                setTimeout(() => {
                    const printBtn = document.querySelector('.print-button, .button.print');
                    if (printBtn?.offsetParent) {
                        printBtn.click();
                    }
                }, 1000);
            }
        });
    }
});