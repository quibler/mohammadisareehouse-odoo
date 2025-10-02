import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class InvoicePaymentReceipt extends Component {
    static template = "pos_invoice_payment.InvoicePaymentReceipt";

    setup() {
        this.pos = usePos();
    }

    get receipt() {
        return this.props.data;
    }

    formatAmount(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return amount.toFixed(3);
    }
}
