/** @odoo-module */
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";
import { useState, Component, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

patch(OrderReceipt.prototype, {
    setup(){
        super.setup();
        this.state = useState({
            template: true,
        })
        this.pos = useService("pos");
    },

    get templateProps() {
        return {
            data: this.props.data,
            // Add proper currency formatting function
            formatCurrency: this.env.utils.formatCurrency.bind(this.env.utils),
            order: this.pos.get_order(),
            receipt: this.pos.get_order()?.export_for_printing() || {},
            orderlines: this.props.data.orderlines || [],
            paymentlines: this.props.data.paymentlines || []
        };
    },

    get templateComponent() {
        var mainRef = this;
        return class extends Component {
            setup() {
                // Ensure environment utilities are available
                this.env.utils = mainRef.env.utils;
            }

            // Wrap the custom template to ensure proper DOM structure
            static template = xml`
                <div class="pos-receipt">
                    ${mainRef.pos.config.design_receipt || '<div>No custom design available</div>'}
                </div>
            `
        };
    },

    get isTrue() {
        // Check if custom receipt is enabled and template exists
        if (this.env.services.pos.config.is_custom_receipt === false || !this.pos.config.design_receipt) {
            return true;
        }
        return false;
    }
});