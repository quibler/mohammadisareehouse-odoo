/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    getInitialState() {
        const initialState = super.getInitialState();

        // Auto-fill the cash count with the expected amount
        if (this.pos.config.cash_control && this.props.default_cash_details) {
            initialState.payments[this.props.default_cash_details.id] = {
                counted: this.env.utils.formatCurrency(this.props.default_cash_details.amount, false),
            };
        }

        return initialState;
    },

    async closeSession() {
        // Get the cash details before closing
        const cashDetails = this.props.default_cash_details;

        if (cashDetails && cashDetails.amount > 0) {
            // Automatically perform cash out for all remaining cash
            try {
                await this.pos.data.call('pos.session', 'create_cash_out_entry', [
                    this.pos.session.id,
                    cashDetails.amount,
                    'Cash Collection - End of Day'
                ]);

                // Update the counted amount to 0 since we're taking all cash out
                if (this.state.payments[cashDetails.id]) {
                    this.state.payments[cashDetails.id].counted = this.env.utils.formatCurrency(0, false);
                }
            } catch (error) {
                console.error('Failed to create automatic cash out:', error);
                // Continue with normal closing if cash out fails
            }
        }

        // Proceed with normal session closing
        return super.closeSession();
    }
});