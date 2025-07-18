from odoo import models, fields, api


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    def _get_print_format_selection(self):
        """Return only the standard Dymo option"""
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

        for product in products:
            _logger.info(f"--- Processing product: {product.name} (ID: {product.id}) ---")

            # Search for posted vendor bills first, then get lines
            posted_moves = self.env['account.move'].search([
                ('move_type', '=', 'in_invoice'),
                ('state', '=', 'posted'),
            ], order='date desc, id desc')

            _logger.info(f"Found {len(posted_moves)} posted vendor bills")

            # Find the latest bill containing this product
            latest_quantity = 0
            for move in posted_moves:
                move_lines = move.invoice_line_ids.filtered(
                    lambda l: l.product_id.id == product.id and l.quantity > 0
                )
                if move_lines:
                    latest_quantity = int(move_lines[0].quantity)
                    _logger.info(f"SUCCESS: Found {product.name} in bill {move.name}: qty={latest_quantity}")
                    break

            if latest_quantity > 0:
                total_quantity += latest_quantity
            else:
                _logger.info(f"WARNING: No posted bill lines found for {product.name}")

        _logger.info(f"TOTAL QUANTITY: {total_quantity}")
        return total_quantity