/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    setup() {
        // Call the original setup first
        super.setup();

        // Modify the cash details to show current session amount only
        if (this.props.default_cash_details) {
            const originalAmount = this.props.default_cash_details.amount || 0;
            const openingAmount = this.props.default_cash_details.opening || 0;
            const currentSessionAmount = originalAmount - openingAmount;

            // Override the amount to show only current session (minimum 0)
            this.props.default_cash_details.amount = Math.max(0, currentSessionAmount);
        }
    },

    getInitialState() {
        const initialState = super.getInitialState();

        // Set default counted value to 0 for cash
        if (this.pos.config.cash_control && this.props.default_cash_details) {
            initialState.payments[this.props.default_cash_details.id].counted = "0";
        }

        // Set default counted value to 0 for non-cash payment methods
        if (this.props.non_cash_payment_methods) {
            this.props.non_cash_payment_methods.forEach(pm => {
                if (pm.type === "bank" && initialState.payments[pm.id]) {
                    initialState.payments[pm.id].counted = "0";
                }
            });
        }

        return initialState;
    },

    /**
     * Override getDifference to always return 0 (no differences shown)
     */
    getDifference(paymentId) {
        return 0;
    },

    /**
     * Override autoFillCashCount to use current session amount
     */
    autoFillCashCount() {
        const count = this.props.default_cash_details.amount; // This will now be current session amount
        this.state.payments[this.props.default_cash_details.id].counted =
            this.env.utils.formatCurrency(count, false);
        this.setManualCashInput(count);
    }
});