odoo.define('pos_salesperson_tracking.models', function (require) {
    'use strict';

    const { Order } = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    // Extend the Order model to include salesperson_id
    const PosOrderSalesperson = (Order) => class PosOrderSalesperson extends Order {
        constructor() {
            super(...arguments);
            this.salesperson_id = this.salesperson_id || false;
        }

        export_as_JSON() {
            const json = super.export_as_JSON(...arguments);
            json.salesperson_id = this.salesperson_id;
            return json;
        }

        init_from_JSON(json) {
            super.init_from_JSON(...arguments);
            this.salesperson_id = json.salesperson_id;
        }

        set_salesperson_id(salesperson_id) {
            this.salesperson_id = salesperson_id;
            this.trigger('change', this);
        }

        get_salesperson_id() {
            return this.salesperson_id;
        }

        get_salesperson_name() {
            if (!this.salesperson_id) {
                return '';
            }
            const salesperson = this.pos.employees_by_id[this.salesperson_id];
            return salesperson ? salesperson.name : '';
        }

        export_for_printing() {
            const result = super.export_for_printing(...arguments);
            result.salesperson = this.get_salesperson_name();
            return result;
        }
    };

    // Register the extended order model
    Registries.Model.extend(Order, PosOrderSalesperson);

    return {
        PosOrderSalesperson
    };
});