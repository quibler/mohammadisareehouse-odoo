/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    getInitialState() {
        const initialState = super.getInitialState();

        // Auto-fill the cash count with the expected amount instead of defaulting to "0"
        if (this.pos.config.cash_control && this.props.default_cash_details) {
            initialState.payments[this.props.default_cash_details.id] = {
                counted: this.env.utils.formatCurrency(this.props.default_cash_details.amount, false),
            };
        }

        return initialState;
    }
});