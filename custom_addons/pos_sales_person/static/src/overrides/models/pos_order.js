/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Order } from "@point_of_sale/app/models/pos_order";

patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        this.sales_person_id = null;
        this.global_discount_amount = 0;
        this.global_discount_percentage = 0;
        this.global_discount_type = null;
    },

    export_for_printing() {
        const result = super.export_for_printing();

        // Add sales person info
        if (this.sales_person_id) {
            const employee = this.pos.employees.find(emp => emp.id === this.sales_person_id);
            result.sales_person = employee ? employee.name : '';
        }

        // Add global discount info
        if (this.global_discount_amount > 0) {
            result.global_discount_amount = this.global_discount_amount;
            result.formatted_global_discount_amount = this.pos.format_currency(this.global_discount_amount);
            result.global_discount_type = 'amount';
        } else if (this.global_discount_percentage > 0) {
            result.global_discount_percentage = this.global_discount_percentage;
            result.global_discount_type = 'percentage';
        }

        return result;
    },

    export_as_JSON() {
        const json = super.export_as_JSON();

        // Add custom fields
        json.sales_person_id = this.sales_person_id;
        json.global_discount_amount = this.global_discount_amount;
        json.global_discount_percentage = this.global_discount_percentage;
        json.global_discount_type = this.global_discount_type;

        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(json);

        // Load custom fields
        this.sales_person_id = json.sales_person_id;
        this.global_discount_amount = json.global_discount_amount || 0;
        this.global_discount_percentage = json.global_discount_percentage || 0;
        this.global_discount_type = json.global_discount_type;
    },

    set_sales_person(employee_id) {
        this.sales_person_id = employee_id;
        this.trigger('change');
    },

    get_sales_person() {
        if (!this.sales_person_id) {
            return null;
        }
        return this.pos.employees.find(emp => emp.id === this.sales_person_id);
    },

    // Override to include amount discount in total calculation
    get_total_with_tax() {
        let total = super.get_total_with_tax();

        // Subtract global amount discount if applied
        if (this.global_discount_type === 'amount' && this.global_discount_amount > 0) {
            total = Math.max(0, total - this.global_discount_amount);
        }

        return total;
    },

    get_total_without_tax() {
        let total = super.get_total_without_tax();

        // Subtract global amount discount if applied
        if (this.global_discount_type === 'amount' && this.global_discount_amount > 0) {
            total = Math.max(0, total - this.global_discount_amount);
        }

        return total;
    },

    // Method to calculate total before any global discounts
    get_total_before_global_discount() {
        return super.get_total_with_tax();
    },

    // Get global discount amount for display
    get_global_discount_amount() {
        if (this.global_discount_type === 'amount') {
            return this.global_discount_amount;
        }
        return 0;
    },

    // Get global discount percentage for display
    get_global_discount_percentage() {
        if (this.global_discount_type === 'percentage') {
            return this.global_discount_percentage;
        }
        return 0;
    },

    // Check if global discount is applied
    has_global_discount() {
        return (this.global_discount_type === 'amount' && this.global_discount_amount > 0) ||
               (this.global_discount_type === 'percentage' && this.global_discount_percentage > 0);
    }
});