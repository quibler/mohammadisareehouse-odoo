from odoo import models, fields, api


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    # Custom price input field
    custom_price = fields.Float(
        'Custom Price',
        digits='Product Price',
        help="Optional custom price for labels. Leave empty to use product's default price."
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

    def _prepare_report_data(self):
        """Override to create custom pricelist when custom price is provided"""
        xml_id, data = super()._prepare_report_data()

        # If custom price is provided, create a temporary pricelist
        if self.custom_price:
            # Get the products that will be printed
            if self.product_tmpl_ids:
                product_templates = self.product_tmpl_ids
                products = self.product_tmpl_ids.mapped('product_variant_ids')
            elif self.product_ids:
                products = self.product_ids
                product_templates = products.mapped('product_tmpl_id')
            else:
                products = self.env['product.product']
                product_templates = self.env['product.template']

            if products or product_templates:
                # Create a temporary pricelist with custom price
                temp_pricelist = self._create_custom_pricelist(products, product_templates)
                data['pricelist'] = temp_pricelist

        return xml_id, data

    def _create_custom_pricelist(self, products, product_templates):
        """Create a temporary pricelist with custom price for specific products"""
        # Create temporary pricelist
        temp_pricelist = self.env['product.pricelist'].create({
            'name': f'Temp Label Pricelist {self.id}',
            'currency_id': self.env.company.currency_id.id,
            'item_ids': []
        })

        # Create pricelist items for each product with custom price
        pricelist_items = []

        # Add items for product variants
        for product in products:
            pricelist_items.append((0, 0, {
                'product_id': product.id,
                'applied_on': '0_product_variant',
                'fixed_price': self.custom_price,
                'pricelist_id': temp_pricelist.id,
            }))

        # Add items for product templates (covers all variants)
        for template in product_templates:
            pricelist_items.append((0, 0, {
                'product_tmpl_id': template.id,
                'applied_on': '1_product',
                'fixed_price': self.custom_price,
                'pricelist_id': temp_pricelist.id,
            }))

        # Update pricelist with items
        if pricelist_items:
            temp_pricelist.write({'item_ids': pricelist_items})

        return temp_pricelist

    def process(self):
        """Override to clean up temporary pricelist after processing"""
        # Store reference to temporary pricelist if created
        temp_pricelist = None
        if self.custom_price:
            # Check if we'll create a temp pricelist
            if self.product_tmpl_ids or self.product_ids:
                # We'll create one in _prepare_report_data, so we need to track it
                pass

        try:
            # Get the report data to check if temp pricelist was created
            xml_id, data = self._prepare_report_data()
            temp_pricelist = data.get('pricelist')

            # Process the report
            if not xml_id:
                from odoo.exceptions import UserError
                raise UserError(_('Unable to find report template for %s format', self.print_format))

            report_action = self.env.ref(xml_id).report_action(None, data=data, config=False)
            report_action.update({'close_on_report_download': True})
            return report_action

        finally:
            # Clean up temporary pricelist
            if temp_pricelist and temp_pricelist.name.startswith('Temp Label Pricelist'):
                try:
                    temp_pricelist.unlink()
                except:
                    # If deletion fails, just log it (temp data will be cleaned up eventually)
                    pass