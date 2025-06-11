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
        this.pos = useState(useService("pos"));
    },

    /**
     * Ensure a value is a number
     */
    ensureNumber(value) {
        if (typeof value === 'string') {
            return parseFloat(value) || 0;
        }
        return isNaN(value) ? 0 : value;
    },

    /**
     * Pre-process orderlines to ensure all prices are numbers
     */
    preprocessOrderlines(orderlines) {
        if (!orderlines || !Array.isArray(orderlines)) {
            return [];
        }

        return orderlines.map(line => ({
            ...line,
            price: this.ensureNumber(line.price),
            unitPrice: this.ensureNumber(line.unitPrice || (line.price / line.qty)),
            qty: this.ensureNumber(line.qty),
            discount: this.ensureNumber(line.discount)
        }));
    },

    /**
     * Pre-process payment lines to ensure all amounts are numbers
     */
    preprocessPaymentlines(paymentlines) {
        if (!paymentlines || !Array.isArray(paymentlines)) {
            return [];
        }

        return paymentlines.map(line => ({
            ...line,
            amount: this.ensureNumber(line.amount)
        }));
    },

    /**
     * Pre-process all monetary data
     */
    preprocessData(data) {
        return {
            ...data,
            amount_total: this.ensureNumber(data.amount_total),
            total_without_tax: this.ensureNumber(data.total_without_tax),
            total_with_tax: this.ensureNumber(data.total_with_tax),
            total_discount: this.ensureNumber(data.total_discount),
            tax_details: data.tax_details ? data.tax_details.map(tax => ({
                ...tax,
                amount: this.ensureNumber(tax.amount)
            })) : []
        };
    },

    get templateProps() {
        const order = this.pos.get_order();
        const receipt = order.export_for_printing();

        // Ensure sales_person is included in the receipt data
        if (order.sales_person_id) {
            receipt.sales_person = order.sales_person_id.name;
        }

        // Pre-process all monetary values
        const processedData = this.preprocessData(this.props.data);
        const processedOrderlines = this.preprocessOrderlines(this.props.data.orderlines);
        const processedPaymentlines = this.preprocessPaymentlines(receipt.paymentlines);

        // Pre-process receipt data
        receipt.amount_total = this.ensureNumber(receipt.amount_total);
        receipt.total_with_tax = this.ensureNumber(receipt.total_with_tax);
        receipt.change = this.ensureNumber(receipt.change);

        // Create a safe formatCurrency that always works
        const safeFormatCurrency = (value) => {
            try {
                const numValue = this.ensureNumber(value);
                return this.env.utils.formatCurrency(numValue);
            } catch (e) {
                console.error('Error formatting currency:', e, 'Value:', value);
                return (this.ensureNumber(value)).toFixed(2);
            }
        };

        return {
            data: processedData,
            order: order,
            receipt: receipt,
            orderlines: processedOrderlines,
            paymentlines: processedPaymentlines,
            // Add env for utility functions
            env: this.env,
            // Add safe formatCurrency function
            formatCurrency: safeFormatCurrency
        };
    },

    get templateComponent() {
        var mainRef = this;

        // Check if custom receipt is enabled and template exists
        if (!mainRef.pos.config.is_custom_receipt || !mainRef.pos.config.design_receipt) {
            // Return null component if no custom receipt
            return null;
        }

        try {
            return class extends Component {
                setup() {}
                static template = xml`${mainRef.pos.config.design_receipt}`
            };
        } catch (e) {
            console.error('Error creating template component:', e);
            return null;
        }
    },

    get isTrue() {
        // Show standard receipt if:
        // 1. Custom receipt is disabled
        // 2. No design template is selected
        // 3. Template component is null
        if (!this.pos.config.is_custom_receipt ||
            !this.pos.config.design_receipt ||
            !this.templateComponent) {
            return true;
        }
        return false;
    }
});