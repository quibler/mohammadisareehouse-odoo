from odoo import models, fields, api


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    # REMOVED: Custom print format restriction that was hiding layout options
    # The field override below has been commented out to restore all default layouts

    """
    def _get_print_format_selection(self):
        # Return only the standard Dymo option
        return [
            ('dymo', 'Dymo'),
        ]

    # Completely redefine the field to force override
    print_format = fields.Selection(
        selection='_get_print_format_selection',
        string="Format",
        default='dymo',
        required=True
    )
    """

    # ADD: Simple custom price input field
    custom_price = fields.Float(
        'Custom Price',
        digits='Product Price',
        help="Optional custom price for labels. Leave empty to use product's default price."
    )

    @api.model
    def default_get(self, fields_list):
        """Override to set default quantity from latest vendor bill and use standard default format"""
        import logging
        _logger = logging.getLogger(__name__)

        res = super().default_get(fields_list)

        # Let the standard default format (2x7xprice) be used instead of forcing dymo
        # No need to override print_format default here

        # Get the products from context
        product_tmpl_ids = self.env.context.get('default_product_tmpl_ids', [])
        product_ids = self.env.context.get('default_product_ids', [])

        _logger.info(f"=== LABEL LAYOUT DEBUG ===")
        _logger.info(f"Context: product_tmpl_ids={product_tmpl_ids}, product_ids={product_ids}")

        if product_tmpl_ids and 'custom_quantity' in fields_list:
            # Get products from templates
            templates = self.env['product.template'].browse(product_tmpl_ids)
            products = templates.mapped('product_variant_ids')

            _logger.info(f"Found {len(products)} products from {len(templates)} templates")

            # Calculate total quantity from latest vendor bills
            total_quantity = self._get_total_quantity_from_latest_bills(products)

            if total_quantity > 0:
                res['custom_quantity'] = total_quantity
                _logger.info(f"SUCCESS: Set custom_quantity to {total_quantity}")
            else:
                _logger.info("WARNING: No quantity found in vendor bills, using default")

        elif product_ids and 'custom_quantity' in fields_list:
            # Get products directly
            products = self.env['product.product'].browse(product_ids)

            _logger.info(f"Found {len(products)} products directly")

            # Calculate total quantity from latest vendor bills
            total_quantity = self._get_total_quantity_from_latest_bills(products)

            if total_quantity > 0:
                res['custom_quantity'] = total_quantity
                _logger.info(f"SUCCESS: Set custom_quantity to {total_quantity}")
            else:
                _logger.info("WARNING: No quantity found in vendor bills, using default")

        _logger.info(f"Final result: {res}")
        _logger.info(f"=== END DEBUG ===")
        return res

    def _get_total_quantity_from_latest_bills(self, products):
        """Get total quantity from latest vendor bills for given products"""
        import logging
        _logger = logging.getLogger(__name__)

        if not products:
            _logger.info("No products provided")
            return 0

        total_quantity = 0

        try:
            # Get all purchase order lines for these products
            purchase_lines = self.env['purchase.order.line'].search([
                ('product_id', 'in', products.ids),
                ('order_id.state', 'in', ['purchase', 'done']),
                ('order_id.invoice_status', 'in', ['invoiced', 'to invoice'])
            ], order='order_id.date_order desc')

            _logger.info(f"Found {len(purchase_lines)} purchase lines")

            # Group by product and get latest bill line for each
            processed_products = set()

            for line in purchase_lines:
                if line.product_id.id not in processed_products:
                    quantity = int(line.product_qty) if line.product_qty else 0
                    total_quantity += quantity
                    processed_products.add(line.product_id.id)
                    _logger.info(f"Product {line.product_id.name}: {quantity} units")

            _logger.info(f"Total calculated quantity: {total_quantity}")

        except Exception as e:
            _logger.error(f"Error calculating quantity: {e}")
            return 0

        return total_quantity

    def _prepare_report_data(self):
        """Override to include custom price in report data"""
        result = super()._prepare_report_data()
        xml_id, data = result

        # Add custom price to the data
        if self.custom_price:
            data['custom_price'] = self.custom_price

        return xml_id, data