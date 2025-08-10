from odoo import models, fields, api


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    # Custom price input field
    custom_price = fields.Float(
        'Custom Price',
        digits='Product Price',
        help="Optional custom price for labels. Leave empty to use product's default price."
    )

    def _prepare_report_data(self):
        """Override to pass custom_price to template context"""
        xml_id, data = super()._prepare_report_data()

        # Add custom_price to the data that gets passed to the template
        if self.custom_price:
            data['custom_price'] = self.custom_price

        return xml_id, data

    @api.model
    def default_get(self, fields_list):
        """Override to set default quantity from latest vendor bill"""
        import logging
        _logger = logging.getLogger(__name__)

        res = super().default_get(fields_list)

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

        return res

    def _get_total_quantity_from_latest_bills(self, products):
        """Calculate total quantity for products from latest vendor bills"""
        if not products:
            return 0

        import logging
        _logger = logging.getLogger(__name__)

        total_quantity = 0

        # First get posted vendor bills ordered by date (your working approach)
        posted_moves = self.env['account.move'].search([
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
        ], order='date desc, id desc')

        for product in products:
            # Find the latest vendor bill that contains this product
            bill_line = None
            for move in posted_moves:
                # Look for this product in the current move's lines
                line = move.line_ids.filtered(
                    lambda l: l.product_id.id == product.id and l.quantity > 0
                )
                if line:
                    bill_line = line[0]  # Take the first matching line
                    break  # Found the most recent bill with this product

            if bill_line:
                quantity = int(bill_line.quantity)
                total_quantity += quantity
                _logger.info(f"Product {product.name}: Found quantity {quantity} from bill {bill_line.move_id.name}")
            else:
                _logger.info(f"Product {product.name}: No vendor bill found")

        _logger.info(f"Total calculated quantity: {total_quantity}")
        return total_quantity