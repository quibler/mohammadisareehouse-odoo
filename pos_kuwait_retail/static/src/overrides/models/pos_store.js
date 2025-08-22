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
        return this.userSelectedMode || (canUsePrice ? "price" : systemRequestedMode || "quantity");
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

// Streamlined mode management
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
        this._toggleButton(["%", "discount", "numpad-discount"], mode === "discount");
    },

    _toggleButton(terms, active) {
        const btn = this._findButton(terms);
        if (btn) btn.classList.toggle('active', active);
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
            const buttons = [...area.querySelectorAll('button, .button, .control-button')];
            const found = buttons.find(btn => {
                const text = btn.textContent?.toLowerCase().trim() || '';
                const classes = btn.className?.toLowerCase() || '';
                const dataMode = btn.getAttribute('data-mode')?.toLowerCase() || '';
                const value = btn.getAttribute('value')?.toLowerCase() || '';

                return searchTerms.some(term => {
                    const termLower = term.toLowerCase();
                    return (
                        text === termLower ||
                        text.includes(termLower) ||
                        classes.includes(termLower) ||
                        dataMode === termLower ||
                        value === termLower ||
                        // Specific cases for % button
                        (term === '%' && (
                            text === '%' ||
                            value === '%' ||
                            text.includes('disc') ||
                            classes.includes('discount') ||
                            classes.includes('numpad-discount')
                        )) ||
                        (term === 'discount' && (
                            classes.includes('numpad-discount') ||
                            text.includes('disc') ||
                            text === '%' ||
                            value === '%'
                        )) ||
                        (term === 'qty' && (text.includes('qty') || text.includes('quantity'))) ||
                        (term === 'quantity' && (text.includes('qty') || text.includes('quantity')))
                    );
                });
            });

            if (found) {
                console.log(`Found button for terms [${searchTerms.join(', ')}] in area:`, area, 'Button:', found);
                return found;
            }
        }

        console.log(`No button found for terms: [${searchTerms.join(', ')}]`);
        return null;
    },

    _attachButtonListeners() {
        // Try multiple times with different delays to catch dynamically loaded buttons
        const tryAttach = (delay) => {
            setTimeout(() => {
                console.log(`Attempting to attach button listeners (delay: ${delay}ms)`);
                this._attachModeListener(["qty", "quantity"], "quantity");
                this._attachModeListener(["price"], "price");
                this._attachModeListener(["%", "discount"], "discount");
            }, delay);
        };

        // Try at multiple intervals
        tryAttach(100);
        tryAttach(500);
        tryAttach(1000);
        tryAttach(2000);
        tryAttach(5000); // Add longer delay for numpad buttons
    },

    // Also attach when order changes (numpad appears)
    _attachOnOrderChange() {
        const tryAttachNumpad = () => {
            console.log('🔄 Order changed, trying to attach numpad listeners...');
            this._attachModeListener(["qty", "quantity"], "quantity");
            this._attachModeListener(["price"], "price");
            this._attachModeListener(["%", "discount", "numpad-discount"], "discount");
        };

        setTimeout(tryAttachNumpad, 100);
        setTimeout(tryAttachNumpad, 500);
    },

    _attachModeListener(terms, mode) {
        // Find button using the enhanced search method
        let btn = this._findButton(terms);

        // Special case for % button - try direct selector if not found
        if (!btn && mode === "discount") {
            // Try the exact selector for your % button
            btn = document.querySelector('button.numpad-discount[value="%"]') ||
                  document.querySelector('button[value="%"]') ||
                  document.querySelector('.numpad-discount');
            if (btn) {
                console.log(`Found % button using direct selector:`, btn);
            }
        }

        if (btn && !btn._modeListenerAttached) {
            // Add click listener
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`🔥 Button clicked: ${mode}, setting mode...`);
                modeManager.setManualMode(mode);
                this._numpadMode = mode;
                this._updateModeVisuals();
                console.log(`✅ Mode changed to: ${mode}, numpadMode is now: ${this._numpadMode}`);
            };

            btn.addEventListener('click', clickHandler);
            btn._modeListenerAttached = true;
            btn._clickHandler = clickHandler; // Store reference for debugging

            console.log(`✅ Attached listener to ${mode} button:`, btn);

            // Test the button immediately
            console.log(`🧪 Testing ${mode} button click...`);
            setTimeout(() => {
                if (btn.offsetParent) { // Check if button is visible
                    console.log(`Button is visible, testing click for ${mode}`);
                } else {
                    console.log(`Button is not visible for ${mode}`);
                }
            }, 100);

        } else if (btn && btn._modeListenerAttached) {
            console.log(`ℹ️ Button for ${mode} already has listener attached`);
        } else {
            console.warn(`❌ Could not find button for mode: ${mode}, terms:`, terms);

            // Debug: For % button, show all buttons with % text
            if (mode === "discount") {
                console.log('🔍 Debugging % button search...');
                const allButtons = [...document.querySelectorAll('button')];
                const percentButtons = allButtons.filter(b =>
                    b.textContent?.includes('%') ||
                    b.getAttribute('value') === '%' ||
                    b.className.includes('discount')
                );
                console.log('Found buttons with % or discount:', percentButtons);

                // Try manual search
                const manualBtn = document.querySelector('button[value="%"]');
                console.log('Manual search for button[value="%"]:', manualBtn);
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
            console.log('📍 POS object stored at window.pos and window.posmodel:', window.pos);

            // Debug: Show the numpad structure
            setTimeout(() => {
                console.log('=== DEBUGGING NUMPAD BUTTONS ===');

                // Look for the actual numpad area (where Qty/Price buttons are)
                const numpadArea = document.querySelector('.numpad');
                if (numpadArea) {
                    console.log('Found .numpad area:', numpadArea);
                    const buttons = numpadArea.querySelectorAll('button');
                    console.log('Buttons in numpad area:', buttons);
                    buttons.forEach((btn, index) => {
                        console.log(`Button ${index}:`, {
                            text: btn.textContent?.trim(),
                            classes: btn.className,
                            value: btn.getAttribute('value'),
                            element: btn
                        });
                    });
                }
                console.log('=== END DEBUG ===');

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

                    if (percentBtn && !percentBtn._modeListenerAttached) {
                        console.log('🎯 Attaching numpad % button listener...', percentBtn);
                        this._attachNumpadModeListener(percentBtn, "discount");
                    }
                    if (qtyBtn && !qtyBtn._modeListenerAttached) {
                        console.log('🎯 Attaching numpad Qty button listener...', qtyBtn);
                        this._attachNumpadModeListener(qtyBtn, "quantity");
                    }
                    if (priceBtn && !priceBtn._modeListenerAttached) {
                        console.log('🎯 Attaching numpad Price button listener...', priceBtn);
                        this._attachNumpadModeListener(priceBtn, "price");
                    }
                }
            };

            // Direct numpad button attachment method
            this._attachNumpadModeListener = (btn, mode) => {
                if (btn && !btn._modeListenerAttached) {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`🔥 Numpad ${mode} button clicked!`);

                        // Update POS mode using the correct object
                        if (window.posmodel) {
                            window.posmodel._numpadMode = mode;
                            console.log(`Mode set to: ${mode}`);

                            // Update visual state
                            this._updateNumpadVisuals(mode);
                        }
                    });
                    btn._modeListenerAttached = true;
                    console.log(`✅ Attached listener to numpad ${mode} button`);
                }
            };

            // Visual update method for numpad buttons
            this._updateNumpadVisuals = (activeMode) => {
                const numpadArea = document.querySelector('.numpad');
                if (numpadArea) {
                    const modeButtons = {
                        quantity: numpadArea.querySelector('button[value="Qty"]'),
                        price: numpadArea.querySelector('button[value="Price"]'),
                        discount: numpadArea.querySelector('button[value="%"]')
                    };

                    // Remove active class from all mode buttons
                    Object.values(modeButtons).forEach(btn => {
                        if (btn) btn.classList.remove('active');
                    });

                    // Add active class to current mode button
                    if (modeButtons[activeMode]) {
                        modeButtons[activeMode].classList.add('active');
                        console.log(`✅ Set ${activeMode} button as active`);
                    }
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