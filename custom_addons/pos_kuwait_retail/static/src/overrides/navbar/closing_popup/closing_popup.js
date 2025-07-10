/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    getInitialState() {
        const initialState = super.getInitialState();

        // Auto-fill cash count if cash control is enabled
        if (this.pos.config.cash_control && this.props.default_cash_details) {
            const cashAmount = this.props.default_cash_details.amount;
            initialState.payments[this.props.default_cash_details.id].counted =
                this.env.utils.formatCurrency(cashAmount, false);
        }

        return initialState;
    }
});