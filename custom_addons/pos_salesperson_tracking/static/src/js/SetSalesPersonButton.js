odoo.define('pos_salesperson_tracking.SetSalespersonButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useListener } = require("@web/core/utils/hooks");
    const Registries = require('point_of_sale.Registries');

    class SetSalespersonButton extends PosComponent {
        setup() {
            super.setup();
            useListener('click', this.onClick);
        }

        get currentSalesperson() {
            const order = this.env.pos.get_order();
            if (!order || !order.get_salesperson_id) return '';

            const salespersonId = order.get_salesperson_id();
            if (!salespersonId) return '';

            const salesperson = this.env.pos.employees_by_id[salespersonId];
            return salesperson ? salesperson.name : '';
        }

        async onClick() {
            const { confirmed, payload: selectedEmployee } = await this.showTempScreen(
                'EmployeeListScreen',
                {
                    title: 'Select Salesperson',
                    list: this.env.pos.employees.filter(e => e.department_id && ['Sales', 'Retail', 'Shop'].includes(e.department_id[1])),
                }
            );

            if (confirmed && selectedEmployee) {
                const order = this.env.pos.get_order();
                if (order && order.set_salesperson_id) {
                    order.set_salesperson_id(selectedEmployee.id);
                    // Trigger a re-render
                    this.render();
                }
            }
        }
    }

    SetSalespersonButton.template = 'pos_salesperson_tracking.SetSalespersonButton';
    Registries.Component.add(SetSalespersonButton);

    // Add the button to the product screen
    ProductScreen.addControlButton({
        component: SetSalespersonButton,
        condition: function() {
            return true; // Always show the button
        },
    });

    return SetSalespersonButton;
});