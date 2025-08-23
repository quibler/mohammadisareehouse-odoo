/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable, ask } from "@point_of_sale/app/store/make_awaitable_dialog";
// Remove the parseFloat import as we'll use native parseFloat

export class DiscountButton extends Component {
    static template = "pos_kuwait_retail.DiscountButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.lastClickTime = 0;
        this.isProcessing = false;
    }

    async onClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Prevent rapid consecutive clicks (debounce)
        const now = Date.now();
        if (this.isProcessing || (now - this.lastClickTime) < 500) {
            return;
        }
        
        this.lastClickTime = now;
        this.isProcessing = true;

        try {
            const order = this.pos.get_order();

            if (!order) {
                return;
            }

            // Check if order has items
            if (order.is_empty()) {
                await ask(this.dialog, {
                    title: _t("No Items"),
                    body: _t("Cannot apply discount to an empty order. Please add items first."),
                });
                return;
            }

            // Get the discount product - try multiple methods
            let discountProduct = this._findDiscountProduct();

            if (!discountProduct) {
                await ask(this.dialog, {
                    title: _t("Discount Product Not Found"),
                    body: _t("The discount product is not available. Please ensure the discount product is configured in your POS."),
                });
                return;
            }

            // Get current order total (excluding existing discounts)
            const orderTotal = this._getOrderTotalExcludingDiscounts(order);

            if (orderTotal <= 0) {
                await ask(this.dialog, {
                    title: _t("Invalid Order Total"),
                    body: _t("Cannot apply discount. Order total must be greater than zero."),
                });
                return;
            }

            // Show number popup for discount amount
            const discountAmount = await makeAwaitable(this.dialog, NumberPopup, {
                title: _t("Enter Discount Amount"),
                subtitle: _t(`Maximum discount: ${this.pos.env.utils.formatCurrency(orderTotal)}`),
                startingValue: 0,
            });

            // Check if user canceled (discountAmount will be undefined) or entered invalid amount
            if (discountAmount === undefined || discountAmount === null) {
                return;
            }

            // Convert to number (NumberPopup might return string or number)
            const finalDiscountAmount = typeof discountAmount === 'number' ? discountAmount : parseFloat(discountAmount);
            
            if (isNaN(finalDiscountAmount) || finalDiscountAmount <= 0) {
                return;
            }

            // Validate discount amount doesn't exceed order total
            if (finalDiscountAmount > orderTotal) {
                await ask(this.dialog, {
                    title: _t("Invalid Discount Amount"),
                    body: _t(`Discount amount cannot exceed order total of ${this.pos.env.utils.formatCurrency(orderTotal)}.`),
                });
                return;
            }

            // Add discount line to order
            await this._addDiscountLine(order, discountProduct, finalDiscountAmount);
        } finally {
            // Reset processing state and remove focus from discount button
            this.isProcessing = false;
            this._removeFocusFromButton(event);
        }
    }

    onKeydown(event) {
        if (event.key === 'Enter') {
            // Prevent Enter key from triggering the click if we're already processing
            if (this.isProcessing || (Date.now() - this.lastClickTime) < 500) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Let the click handler manage the Enter key
            this.onClick(event);
        }
    }

    _removeFocusFromButton(event) {
        // First blur the discount button
        if (event && event.target) {
            event.target.blur();
        }

        // Try to focus on the last order line or a safe fallback
        setTimeout(() => {
            const order = this.pos.get_order();
            if (order && order.get_orderlines().length > 0) {
                // Try to focus on the last order line
                const lastLine = document.querySelector('.orderlines .orderline:last-child');
                if (lastLine) {
                    lastLine.focus();
                    return;
                }
            }

            // Fallback: Focus on the product list or search input
            const productSearch = document.querySelector('.searchbox input, .product-list-container, .products-screen');
            if (productSearch) {
                productSearch.focus();
                return;
            }

            // Ultimate fallback: Focus on document body to remove focus from any button
            document.body.focus();
        }, 100);
    }

    _findDiscountProduct() {
        // Method 1: Try by specific product ID (your discount product)
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
    }

    _getOrderTotalExcludingDiscounts(order) {
        let total = 0;
        const discountProduct = this._findDiscountProduct();

        for (const line of order.lines) {
            // Skip discount products when calculating total
            if (!discountProduct || line.product_id.id !== discountProduct.id) {
                total += line.get_price_with_tax();
            }
        }
        return total;
    }

    async _addDiscountLine(order, discountProduct, discountAmount) {
        try {
            // Add discount as negative amount
            await this.pos.addLineToCurrentOrder(
                {
                    product_id: discountProduct,
                    price_unit: -discountAmount, // Negative amount for discount
                    qty: 1
                },
                {},
                false // Don't configure
            );

            // Set a note on the discount line to indicate it's a manual discount
            const discountLine = order.get_last_orderline();
            if (discountLine && discountLine.product_id.id === discountProduct.id) {
                discountLine.setNote(`Manual discount: ${this.pos.env.utils.formatCurrency(discountAmount)}`);
            }

        } catch (error) {
            await ask(this.dialog, {
                title: _t("Error"),
                body: _t("Failed to apply discount. Please try again."),
            });
        }
    }
}