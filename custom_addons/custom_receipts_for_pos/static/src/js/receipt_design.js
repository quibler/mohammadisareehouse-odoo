/** @odoo-module */
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";
import { useState, Component, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

patch(OrderReceipt.prototype, {
    setup() {
        super.setup();
        this.state = useState({
            template: true,
        });
        this.pos = useService("pos");
    },

    get templateProps() {
        return {
            data: this.props.data,
            order: this.pos.get_order(),
            receipt: this.pos.get_order().export_for_printing(),
            orderlines: this.props.data.orderlines,
            paymentlines: this.pos.get_order().export_for_printing().paymentlines,
            env: this.env,
            formatCurrency: this.env.utils.formatCurrency.bind(this.env.utils),
        };
    },

    get templateComponent() {
        const mainRef = this;
        return class CustomReceiptComponent extends Component {
            static template = xml`${mainRef.pos.config.design_receipt}`;

            // Add static props to prevent validation errors
            static props = {
                data: { type: Object, optional: true },
                order: { type: Object, optional: true },
                receipt: { type: Object, optional: true },
                orderlines: { type: Array, optional: true },
                paymentlines: { type: Array, optional: true },
                env: { type: Object, optional: true },
                formatCurrency: { type: Function, optional: true },
            };

            setup() {
                super.setup();
            }
        };
    },

    get isTrue() {
        // Use strict comparison and check for config existence
        return !this.pos.config?.is_custom_receipt;
    }
});