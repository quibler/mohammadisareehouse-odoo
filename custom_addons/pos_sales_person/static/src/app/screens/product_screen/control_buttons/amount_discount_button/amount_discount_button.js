/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class AmountDiscountButton extends Component {
    static template = "custom_pos.AmountDiscountButton";

    setup() {
        this.pos = useService("pos");
        this.popup = useService("popup");
        this.notification = useService("pos_notification");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get isDisabled() {
        return !this.currentOrder || this.currentOrder.lines.length === 0;
    }

    get discountAmount() {
        const order = this.currentOrder;
        if (!order || !order.global_discount_amount) {
            return 0;
        }
        return order.global_discount_amount;
    }

    get formattedDiscountAmount() {
        if (this.discountAmount === 0) {
            return "";
        }
        return this.pos.format_currency(this.discountAmount);
    }

    async onClick() {
        if (this.isDisabled) {
            return;
        }

        const order = this.currentOrder;
        const maxDiscount = this.pos.config.max_global_discount_amount || 100;

        const { confirmed, payload } = await this.popup.add("NumberPopup", {
            title: _t("Apply Amount Discount"),
            body: _t("Enter the discount amount (max: %s)", this.pos.format_currency(maxDiscount)),
            startingValue: order.global_discount_amount || 0,
        });

        if (!confirmed) {
            return;
        }

        const discountAmount = Math.abs(parseFloat(payload)) || 0;

        // Validation
        if (discountAmount > maxDiscount) {
            this.notification.add(
                _t("Discount amount cannot exceed %s", this.pos.format_currency(maxDiscount)),
                { type: "danger" }
            );
            return;
        }

        const orderTotal = order.get_total_without_tax();
        if (discountAmount > orderTotal) {
            this.notification.add(
                _t("Discount amount cannot exceed order total (%s)", this.pos.format_currency(orderTotal)),
                { type: "danger" }
            );
            return;
        }

        // Apply the discount
        this.applyAmountDiscount(discountAmount);
    }

    applyAmountDiscount(amount) {
        const order = this.currentOrder;

        // Remove any existing percentage discount first
        this.removeExistingDiscounts();

        if (amount === 0) {
            // Remove amount discount
            order.global_discount_amount = 0;
            order.global_discount_type = null;
            this.notification.add(_t("Amount discount removed"), { type: "success" });
        } else {
            // Apply amount discount
            order.global_discount_amount = amount;
            order.global_discount_type = 'amount';

            // Calculate and apply line discounts
            this.distributeAmountDiscount(amount);

            this.notification.add(
                _t("Amount discount of %s applied", this.pos.format_currency(amount)),
                { type: "success" }
            );
        }
    }

    removeExistingDiscounts() {
        const order = this.currentOrder;

        // Remove line-level discounts applied by global discount
        order.lines.forEach(line => {
            if (line.global_discount_applied) {
                line.set_discount(0);
                line.global_discount_applied = false;
            }
        });

        // Clear global discount data
        order.global_discount_amount = 0;
        order.global_discount_percentage = 0;
        order.global_discount_type = null;
    }

    distributeAmountDiscount(totalDiscountAmount) {
        const order = this.currentOrder;
        const lines = order.lines;

        if (lines.length === 0 || totalDiscountAmount === 0) {
            return;
        }

        // Calculate total amount before discount
        const orderSubtotal = order.get_total_without_tax();

        if (orderSubtotal === 0) {
            return;
        }

        // Distribute discount proportionally
        let remainingDiscount = totalDiscountAmount;

        lines.forEach((line, index) => {
            const lineSubtotal = line.get_price_without_tax();

            if (index === lines.length - 1) {
                // Last line gets the remaining discount to handle rounding
                const lineDiscountAmount = remainingDiscount;
                const lineDiscountPercentage = (lineDiscountAmount / lineSubtotal) * 100;

                line.set_discount(Math.min(lineDiscountPercentage, 100));
                line.global_discount_applied = true;
            } else {
                // Calculate proportional discount
                const proportion = lineSubtotal / orderSubtotal;
                const lineDiscountAmount = totalDiscountAmount * proportion;
                const lineDiscountPercentage = (lineDiscountAmount / lineSubtotal) * 100;

                line.set_discount(Math.min(lineDiscountPercentage, 100));
                line.global_discount_applied = true;

                remainingDiscount -= lineDiscountAmount;
            }
        });
    }
}