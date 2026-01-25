/** @odoo-module */

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

// Extend props to accept invoice_payments_details from the backend
patch(ClosePosPopup, {
    props: [...ClosePosPopup.props, "invoice_payments_details?"],
});
