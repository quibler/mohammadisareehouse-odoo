/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

/**
 * OPTIMIZED POS NAVIGATION - Kuwait Retail
 *
 * Product Screen: Arrow keys for quantity, Arrow Right to Payment
 * Payment Screen: Arrow Left/Right for navigation only
 * Receipt Screen: Enter to print, default Odoo behavior otherwise
 *
 * DIRECT FUNCTION CALL API:
 * Instead of targeting DOM elements and clicking them, use these direct method calls:
 *
 * Receipt Screen Actions (available when window.receiptAPI is loaded):
 * - window.receiptAPI.printFullReceipt()     // Print full receipt
 * - window.receiptAPI.printBasicReceipt()    // Print basic receipt  
 * - window.receiptAPI.sendReceiptEmail(email) // Send via email (optional email param)
 * - window.receiptAPI.editPayment()          // Edit payment details
 * - window.receiptAPI.newOrder()             // Start new order (MANUAL ONLY - only works on receipt screen)
 * - window.receiptAPI.isReceiptScreenActive() // Check if receipt screen is active
 * - window.receiptAPI.getOrderAmount()       // Get current order amount
 *
 * Navigation Actions:
 * - window.pos.pay()                         // Go to payment screen from product screen
 * - window.pos.onClickBackButton()           // Go back to product screen from payment
 * - window.paymentScreen.validateOrder()     // Validate payment (payment screen)
 * - window.receiptAPI.newOrder()             // Start new order from receipt screen
 * 
 * Payment Screen Actions (available when window.paymentScreen is loaded):
 * - window.paymentScreen.addNewPaymentLine(method) // Add payment line
 * - window.paymentScreen.deletePaymentLine(uuid)   // Delete payment line
 * - window.paymentScreen.validateOrder()           // Validate and complete order
 * - window.paymentScreen.toggleIsToInvoice()       // Toggle invoice flag
 * - window.paymentScreen.addTip()                  // Add tip to order
 *
 * Order Management:
 * - order.set_quantity(qty)                  // Set quantity directly
 * - order.removeOrderline(line)              // Remove order line directly
 * - pos.addLineToCurrentOrder(product, options) // Add product directly
 *
 * This approach is more reliable than DOM clicking because:
 * 1. No dependency on CSS classes or DOM structure
 * 2. Direct method calls are faster and more predictable
 * 3. Less likely to break when UI changes
 * 4. Better error handling and logging
 * 5. Automatic fallback to DOM clicking if direct methods fail
 * 
 * IMPORTANT: RECEIPT SCREEN BEHAVIOR
 * - Receipt screen is NEVER automatically skipped
 * - New Order can ONLY be triggered by manual user action (button click)
 * - Auto-print is allowed, but user must manually start new order
 * - All automatic navigation away from receipt screen is blocked
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
        this.notification = useService("notification");
        this.initializeKeyboardHandling();
        this.watchForOrderChanges();
    },

    // Zero price validation method
    validateOrderPrices() {
        const order = this.pos?.get_order?.();
        if (!order || !order.get_orderlines) {
            return { valid: true, zeroPriceItems: [] };
        }

        const orderlines = order.get_orderlines();
        if (!orderlines || orderlines.length === 0) {
            return { valid: true, zeroPriceItems: [] };
        }

        // Check each order line for zero or negative unit prices only, but skip discount products
        const zeroPriceLines = orderlines.filter(line => {
            const unitPrice = line.get_unit_price ? line.get_unit_price() : line.price_unit;
            
            // Skip discount products - they are allowed to have negative prices
            if (this._isDiscountLine(line)) {
                return false;
            }
            
            // Only check unit price - total can be zero due to discounts
            return unitPrice <= 0;
        });

        const zeroPriceItems = zeroPriceLines.map(line => {
            const product = line.get_product ? line.get_product() : line.product_id;
            return product ? product.display_name || product.name : 'Unknown Product';
        });

        return {
            valid: zeroPriceLines.length === 0,
            zeroPriceItems: zeroPriceItems,
            zeroPriceCount: zeroPriceLines.length
        };
    },

    // Find discount product using same logic as DiscountButton
    _findDiscountProduct() {
        // Method 1: Try by specific product ID (discount product)
        try {
            let product = this.pos.models["product.product"].get(3007);
            if (product) return product;
        } catch (e) {}

        // Method 2: Try by exact name "Discount"
        const allProducts = this.pos.models["product.product"].getAll();
        let product = allProducts.find(p =>
            p.name && p.name.toLowerCase() === 'discount'
        );
        if (product) return product;

        // Method 3: Try by name containing "discount" (fallback)
        product = allProducts.find(p =>
            p.name && p.name.toLowerCase().includes('discount')
        );
        if (product) return product;

        // Method 4: Check POS config for specific discount product
        if (this.pos.config.discount_product_id) {
            product = this.pos.models["product.product"].get(this.pos.config.discount_product_id.id);
            if (product) return product;
        }

        return null;
    },

    // Check if a line is a discount product line
    _isDiscountLine(line) {
        const discountProduct = this._findDiscountProduct();
        if (!discountProduct) return false;
        
        const lineProductId = line.product_id ? line.product_id.id : 
                             (line.get_product ? line.get_product().id : null);
        return lineProductId === discountProduct.id;
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
                    // Validate order prices before proceeding to payment
                    const validation = this.validateOrderPrices();
                    if (!validation.valid) {
                        // Show error banner notification for zero price items
                        const itemsList = validation.zeroPriceItems.join(', ');
                        const itemText = validation.zeroPriceCount === 1 ? 'item has' : 'items have';
                        
                        this.notification.add(
                            _t("Cannot proceed to payment. The following %s zero price: %s. Please set prices for all items before proceeding to payment.", itemText, itemsList),
                            {
                                title: _t("Cannot Proceed to Payment"),
                                type: "warning",
                                sticky: false
                            }
                        );
                        handled = true; // Prevent default payment action
                        break;
                    }

                    // Use the exact same method as the template: this.pos.pay()
                    try {
                        if (this.pos && this.pos.pay && typeof this.pos.pay === 'function') {
//                            console.log('Product screen: Using pos.pay() method directly');
                            this.pos.pay();
                            handled = true;
                        } else {
                            // Fallback to DOM clicking if pos.pay() not available
                            const payBtn = document.querySelector('.btn-switchpane.pay-button, .pay-button') ||
                                         [...document.querySelectorAll('button')].find(btn =>
                                           btn.textContent?.toLowerCase().includes('pay'));
                            if (payBtn?.offsetParent) {
//                                console.log('Product screen: Using DOM click fallback for payment');
                                payBtn.click();
                                handled = true;
                            }
                        }
                    } catch (error) {
                        console.warn('Direct pos.pay() failed, using DOM fallback:', error);
                        // Fallback to DOM clicking
                        const payBtn = document.querySelector('.btn-switchpane.pay-button, .pay-button') ||
                                     [...document.querySelectorAll('button')].find(btn =>
                                       btn.textContent?.toLowerCase().includes('pay'));
                        if (payBtn?.offsetParent) {
                            payBtn.click();
                            handled = true;
                        }
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
                // Use the exact same method as the template: pos.onClickBackButton()
                try {
                    if (this.pos && this.pos.onClickBackButton && typeof this.pos.onClickBackButton === 'function') {
//                        console.log('Payment screen: Using pos.onClickBackButton() method directly');
                        this.pos.onClickBackButton();
                        handled = true;
                    } else {
                        // Fallback to DOM clicking
                        const backBtn = document.querySelector('.button.back, .back-button, .btn-switchpane.back-button');
                        if (backBtn?.offsetParent) {
//                            console.log('Payment screen: Using DOM click fallback for back navigation');
                            backBtn.click();
                            handled = true;
                        }
                    }
                } catch (error) {
                    console.warn('Direct back navigation failed, using DOM fallback:', error);
                    const backBtn = document.querySelector('.button.back, .back-button, .btn-switchpane.back-button');
                    if (backBtn?.offsetParent) {
                        backBtn.click();
                        handled = true;
                    }
                }
                break;
            
            case 'ArrowRight':
                // Use the exact same method as the template: validateOrder()
                try {
                    const currentScreen = this.getCurrentPaymentScreen();
                    if (currentScreen && currentScreen.validateOrder && typeof currentScreen.validateOrder === 'function') {
                        // Check if order can be validated (same logic as template)
                        const order = this.pos?.get_order?.();
                        if (order && order.is_paid && order.is_paid() && order._isValidEmptyOrder && order._isValidEmptyOrder()) {
//                            console.log('Payment screen: Using validateOrder() method directly');
                            currentScreen.validateOrder();
                            handled = true;
                        }
                    } else {
                        // Fallback to DOM clicking
                        const validateBtn = document.querySelector('.button.next, .validation-button, .btn-switchpane.validation-button');
                        if (validateBtn?.offsetParent && !validateBtn.disabled && !validateBtn.classList.contains('disabled')) {
//                            console.log('Payment screen: Using DOM click fallback for validation');
                            validateBtn.click();
                            handled = true;
                        }
                    }
                } catch (error) {
                    console.warn('Direct validation failed, using DOM fallback:', error);
                    const validateBtn = document.querySelector('.button.next, .validation-button, .btn-switchpane.validation-button');
                    if (validateBtn?.offsetParent && !validateBtn.disabled && !validateBtn.classList.contains('disabled')) {
                        validateBtn.click();
                        handled = true;
                    }
                }
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    },

    getCurrentPaymentScreen() {
        // Try to get the current PaymentScreen instance
        if (window.paymentScreen) {
            return window.paymentScreen;
        }
        
        // Try to find it in the POS screens registry
        try {
            const registry = window.owl?.registry || window.__owl_registry__;
            if (registry && registry.category) {
                const posScreens = registry.category('pos_screens');
                const PaymentScreen = posScreens.get('PaymentScreen');
                if (PaymentScreen && PaymentScreen.prototype) {
                    // Return the current instance if available
                    const paymentElements = document.querySelectorAll('.payment-screen');
                    for (const elem of paymentElements) {
                        if (elem.__owl__ && elem.__owl__.component) {
                            return elem.__owl__.component;
                        }
                    }
                }
            }
        } catch (e) {
            // Continue to fallback
        }
        
        return null;
    },

    handleReceiptScreenKeys(event) {
        if (event.key === 'Enter') {
            // Use direct method call instead of DOM clicking
            if (window.receiptAPI && window.receiptAPI.printFullReceipt) {
//                console.log('Receipt screen: Using direct print method via keyboard');
                window.receiptAPI.printFullReceipt();
                event.preventDefault();
                event.stopPropagation();
            } else {
                // Fallback to DOM clicking if API not available
                const printBtn = document.querySelector('.print-button, .button.print');
                if (printBtn?.offsetParent) {
                    printBtn.click();
                    event.preventDefault();
                    event.stopPropagation();
                }
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

    // Find discount product using same logic as DiscountButton (PosStore version)
    _findDiscountProduct() {
        // Method 1: Try by specific product ID (discount product)
        try {
            let product = this.models["product.product"].get(3007);
            if (product) return product;
        } catch (e) {}

        // Method 2: Try by exact name "Discount"
        const allProducts = this.models["product.product"].getAll();
        let product = allProducts.find(p =>
            p.name && p.name.toLowerCase() === 'discount'
        );
        if (product) return product;

        // Method 3: Try by name containing "discount" (fallback)
        product = allProducts.find(p =>
            p.name && p.name.toLowerCase().includes('discount')
        );
        if (product) return product;

        // Method 4: Check POS config for specific discount product
        if (this.config.discount_product_id) {
            product = this.models["product.product"].get(this.config.discount_product_id.id);
            if (product) return product;
        }

        return null;
    },

    // Check if a line is a discount product line (PosStore version)
    _isDiscountLine(line) {
        const discountProduct = this._findDiscountProduct();
        if (!discountProduct) return false;
        
        const lineProductId = line.product_id ? line.product_id.id : 
                             (line.get_product ? line.get_product().id : null);
        return lineProductId === discountProduct.id;
    },

    // Override pay method to add zero price validation
    pay() {
        const order = this.get_order();
        if (!order || !order.get_orderlines) {
            return super.pay();
        }

        const orderlines = order.get_orderlines();
        if (!orderlines || orderlines.length === 0) {
            return super.pay();
        }

        // Check for zero unit price items only, but skip discount products
        const zeroPriceLines = orderlines.filter(line => {
            const unitPrice = line.get_unit_price ? line.get_unit_price() : line.price_unit;
            
            // Skip discount products - they are allowed to have negative prices
            if (this._isDiscountLine(line)) {
                return false;
            }
            
            // Only check unit price - total can be zero due to discounts
            return unitPrice <= 0;
        });

        if (zeroPriceLines.length > 0) {
            const zeroPriceItems = zeroPriceLines.map(line => {
                const product = line.get_product ? line.get_product() : line.product_id;
                return product ? product.display_name || product.name : 'Unknown Product';
            });

            const itemsList = zeroPriceItems.join(', ');
            const itemText = zeroPriceLines.length === 1 ? 'item has' : 'items have';

            // Use notification service if dialog not available in PosStore
            if (this.env && this.env.services && this.env.services.notification) {
                this.env.services.notification.add(
                    _t("Cannot proceed to payment. The following %s zero price: %s. Please set prices for all items before proceeding.", itemText, itemsList),
                    {
                        title: _t("Cannot Proceed to Payment"),
                        type: "warning",
                        sticky: false
                    }
                );
            } else {
                // Fallback to console warning
                console.warn('Cannot proceed to payment - zero price items:', zeroPriceItems);
            }
            return; // Prevent payment
        }

        // If validation passes, proceed with normal payment
        return super.pay();
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

// Payment Screen: Store instance globally for direct access and prevent auto-skip
patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        
        onMounted(() => {
            // Store payment screen instance globally for direct access
            window.paymentScreen = this;
//            console.log('Payment screen instance stored globally');
        });
    },

    /**
     * Override afterOrderValidation to ALWAYS show receipt screen
     * Never auto-skip to new order - user must manually click "New Order"
     */
    async afterOrderValidation() {
        // Always show the receipt screen regardless of configuration
        let nextScreen = "ReceiptScreen";
        let switchScreen = true;

        // Handle auto-printing if configured, but NEVER skip receipt screen
        if (
            this.currentOrder.nb_print === 0 &&
            this.pos.config.iface_print_auto
        ) {
            const invoiced_finalized = this.currentOrder.is_to_invoice()
                ? this.currentOrder.finalized
                : true;

            if (invoiced_finalized) {
//                console.log('Auto-printing receipt, but staying on receipt screen');
                this.pos.printReceipt(this.currentOrder);
                
                // IMPORTANT: Never skip receipt screen, even if iface_print_skip_screen is true
                // Always force user to manually click "New Order"
            }
        }

        // ALWAYS go to receipt screen - never auto-skip
        if (switchScreen) {
//            console.log('Showing receipt screen - user must manually start new order');
            this.pos.showScreen(nextScreen);
        }
    },

    /**
     * Override selectNextOrder to prevent automatic order switching
     * This should only be called when user manually clicks "New Order"
     */
    selectNextOrder() {
        // This method should only be called from receipt screen manual button click
        // Don't automatically select next order from payment screen
//        console.log('selectNextOrder called - should only happen from manual button click');
        
        if (this.currentOrder.originalSplittedOrder) {
            this.pos.selectedOrderUuid = this.currentOrder.originalSplittedOrder.uuid;
        } else {
            this.pos.selectEmptyOrder();
        }
    }
});

// Receipt Screen: Enhanced functionality with direct method calls
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        
        onMounted(() => {
            // Make methods globally accessible for external calls
            this.setupGlobalReceiptAPI();
            
            // Auto-print receipt when screen is mounted/rendered
            // Try multiple times with different delays to handle various loading states
            this.autoPrintReceipt();
            
            // Backup attempts in case first one fails due to timing
            setTimeout(() => this.autoPrintReceipt(), 1000);
            setTimeout(() => this.autoPrintReceipt(), 2000);
        });
    },

    /**
     * Setup global API for external access to receipt functions
     * This allows direct function calls instead of DOM targeting
     */
    setupGlobalReceiptAPI() {
        // Store receipt screen instance globally for direct access
        window.receiptScreen = this;
        
        // Create simplified API object for external use
        window.receiptAPI = {
            // Direct method calls - most reliable approach
            printFullReceipt: () => this.directPrintFull(),
            printBasicReceipt: () => this.directPrintBasic(),
            sendReceiptEmail: (email = null) => this.directSendEmail(email),
            editPayment: () => this.directEditPayment(),
            newOrder: () => this.directNewOrder(),
            
            // Utility methods
            isReceiptScreenActive: () => this.isCurrentScreen(),
            getOrderAmount: () => this.orderAmountPlusTip,
            validateEmail: (email) => this.isValidEmail
        };
        
//        console.log('Receipt API initialized - use window.receiptAPI for direct calls');
    },

    /**
     * Direct method calls - bypass DOM entirely
     */
    directPrintFull() {
        try {
            if (this.doFullPrint && typeof this.doFullPrint.call === 'function') {
//                console.log('Calling doFullPrint directly');
                return this.doFullPrint.call();
            }
            throw new Error('doFullPrint method not available');
        } catch (error) {
            console.warn('Direct print full failed, falling back to DOM:', error);
            return this.fallbackPrintFull();
        }
    },

    directPrintBasic() {
        try {
            if (this.doBasicPrint && typeof this.doBasicPrint.call === 'function') {
//                console.log('Calling doBasicPrint directly');
                return this.doBasicPrint.call();
            }
            throw new Error('doBasicPrint method not available');
        } catch (error) {
            console.warn('Direct print basic failed, falling back to DOM:', error);
            return this.fallbackPrintBasic();
        }
    },

    directSendEmail(email = null) {
        try {
            if (email) {
                this.state.email = email;
            }
            
            if (this.actionSendReceiptOnEmail && typeof this.actionSendReceiptOnEmail === 'function') {
//                console.log('Calling actionSendReceiptOnEmail directly');
                return this.actionSendReceiptOnEmail();
            }
            throw new Error('actionSendReceiptOnEmail method not available');
        } catch (error) {
            console.warn('Direct send email failed, falling back to DOM:', error);
            return this.fallbackSendEmail();
        }
    },

    directEditPayment() {
        try {
            if (this.pos && this.pos.orderDetails && typeof this.pos.orderDetails === 'function') {
//                console.log('Calling pos.orderDetails directly');
                return this.pos.orderDetails(this.currentOrder);
            }
            throw new Error('pos.orderDetails method not available');
        } catch (error) {
            console.warn('Direct edit payment failed, falling back to DOM:', error);
            return this.fallbackEditPayment();
        }
    },

    directNewOrder() {
        try {
            if (this.orderDone && typeof this.orderDone === 'function') {
//                console.log('Starting new order via direct orderDone call');
                return this.orderDone();
            }
            throw new Error('orderDone method not available');
        } catch (error) {
            console.warn('Direct new order failed, falling back to DOM:', error);
            return this.fallbackNewOrder();
        }
    },

    /**
     * Fallback DOM methods - only used when direct calls fail
     */
    fallbackPrintFull() {
        const selectors = [
            'button.button.print.btn.btn-lg.btn-secondary',
            '.button.print[data-action="print-full"]',
            'button:contains("Print Full Receipt")',
            '.button.print'
        ];
        return this.clickFirstAvailable(selectors, 'print full receipt');
    },

    fallbackPrintBasic() {
        const selectors = [
            'button.button.print[data-action="print-basic"]',
            'button:contains("Print Basic Receipt")'
        ];
        return this.clickFirstAvailable(selectors, 'print basic receipt');
    },

    fallbackSendEmail() {
        const selectors = [
            'button[data-action="send-email"]',
            '.btn.btn-primary[aria-label*="email"]',
            'button .fa-paper-plane'
        ];
        return this.clickFirstAvailable(selectors, 'send email');
    },

    fallbackEditPayment() {
        const selectors = [
            '[data-action="edit-payment"]',
            '.edit-order-payment',
            'span:contains("Edit Payment")'
        ];
        return this.clickFirstAvailable(selectors, 'edit payment');
    },

    fallbackNewOrder() {
        const selectors = [
            'button[name="done"]',
            '[data-action="new-order"]',
            'button:contains("New Order")'
        ];
//        console.log('Using DOM fallback for new order');
        return this.clickFirstAvailable(selectors, 'new order');
    },

    /**
     * Utility method to click first available element from selectors
     */
    clickFirstAvailable(selectors, actionName) {
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.offsetParent) {
//                    console.log(`Fallback: clicking ${actionName} using selector: ${selector}`);
                    element.click();
                    return true;
                }
            } catch (e) {
                // Continue to next selector
            }
        }
        
        // Text-based fallback
        const buttons = document.querySelectorAll('button, .button, [role="button"]');
        for (const btn of buttons) {
            if (btn.offsetParent && 
                btn.textContent?.toLowerCase().includes(actionName.toLowerCase())) {
//                console.log(`Fallback: clicking ${actionName} using text search`);
                btn.click();
                return true;
            }
        }
        
        console.warn(`Failed to ${actionName} - no suitable element found`);
        return false;
    },

    /**
     * Check if receipt screen is currently active
     */
    isCurrentScreen() {
        return document.querySelector('.receipt-screen:not(.oe_hidden)')?.offsetParent !== null;
    },


    /**
     * Enhanced auto-print receipt using direct method calls
     * Falls back to DOM clicking only if direct methods fail
     */
    autoPrintReceipt() {
        // Prevent multiple print attempts
        if (this._autoPrintAttempted) {
            return;
        }
        
        // Always auto-print receipts when receipt screen loads
        // Wait a brief moment for the screen to fully render
        setTimeout(() => {
//            console.log('Auto-printing receipt using direct method call');
            const success = this.directPrintFull();
            
            if (success) {
                this._autoPrintAttempted = true;
            } else {
                console.log('Auto-print failed - no suitable print method found');
            }
        }, 500); // 500ms delay to ensure screen is fully rendered
    }
});