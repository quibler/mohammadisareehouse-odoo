# -*- coding: utf-8 -*-

import logging
import re
import time
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Kuwait retail defaults
    available_in_pos = fields.Boolean(default=True)
    type = fields.Selection(selection_add=[], default='consu')
    list_price = fields.Float(default=0.0)

    @api.model
    def default_get(self, fields_list):
        """Set Kuwait retail defaults"""
        defaults = super().default_get(fields_list)
        defaults.update({
            'available_in_pos': True,
            'type': 'consu',
            'list_price': 0.0
        })
        return defaults

    @api.model_create_multi
    def create(self, vals_list):
        """Auto-generate barcodes when creating product templates"""
        # Create templates first
        templates = super().create(vals_list)

        # Now ensure variants get barcodes
        for template in templates:
            # Only process if template has exactly one variant (standard case)
            if len(template.product_variant_ids) == 1:
                variant = template.product_variant_ids[0]
                if not variant.barcode and template.name:
                    # Generate barcode using the variant's method
                    generated_barcode = variant._generate_barcode_from_name(template.name)
                    variant.barcode = generated_barcode
                    _logger.info(f"Generated barcode '{generated_barcode}' for template variant '{template.name}'")

        return templates


class ProductProduct(models.Model):
    _inherit = 'product.product'

    # ========== BARCODE GENERATION ==========

    def _clean_name_for_barcode(self, name):
        """Convert product name to uppercase barcode format"""
        if not name:
            return ""

        # Clean and format: uppercase, replace spaces with underscores, remove special chars
        cleaned = re.sub(r'[^A-Za-z0-9\s\-\._]', '', name.strip())
        cleaned = cleaned.replace(' ', '_').upper()
        cleaned = re.sub(r'_+', '_', cleaned)  # Remove multiple underscores

        # Truncate to 25 chars for Code128 compatibility
        if len(cleaned) > 25:
            cleaned = cleaned[:25]
            _logger.info(f"Truncated barcode from {len(name)} to 25 chars: {name}")

        return cleaned

    def _generate_fallback_barcode(self):
        """Generate PROD_ID or PROD_timestamp fallback"""
        if hasattr(self, 'id') and self.id:
            return f"PROD_{self.id}"
        return f"PROD_{str(int(time.time()))[-6:]}"

    def _ensure_unique_barcode(self, base_barcode):
        """Ensure barcode uniqueness by appending counter if needed"""
        barcode = base_barcode
        counter = 1

        while True:
            # Check if barcode exists (excluding current record)
            domain = [('barcode', '=', barcode)]
            if hasattr(self, 'id') and self.id:
                domain.append(('id', '!=', self.id))

            if not self.search(domain) or self.env.context.get('skip_barcode_uniqueness'):
                return barcode

            # Make unique by appending counter
            counter += 1
            suffix = f"_{counter}"
            max_base = 25 - len(suffix)
            barcode = (base_barcode[:max_base] if len(base_barcode) > max_base else base_barcode) + suffix

    def _generate_barcode_from_name(self, name):
        """Main barcode generation method - generates Code128 compatible barcode from name"""
        cleaned = self._clean_name_for_barcode(name)

        if not cleaned:
            barcode = self._generate_fallback_barcode()
            _logger.info(f"Using fallback barcode {barcode} for empty name: '{name}'")
        else:
            barcode = cleaned

        unique_barcode = self._ensure_unique_barcode(barcode)
        if unique_barcode != barcode:
            _logger.info(f"Made barcode unique: {barcode} -> {unique_barcode}")

        return unique_barcode

    # ========== CREATE & WRITE OVERRIDES ==========

    @api.model_create_multi
    def create(self, vals_list):
        """Auto-generate barcodes and set Kuwait retail defaults"""
        for vals in vals_list:
            # Set retail defaults
            if vals.get('type') == 'consu' and 'is_storable' not in vals:
                vals['is_storable'] = True

            # Auto-generate barcode if not provided
            if not vals.get('barcode'):
                product_name = vals.get('name', '')
                if product_name:
                    generated_barcode = self._generate_barcode_from_name(product_name)
                    vals['barcode'] = generated_barcode
                    _logger.info(f"Generated barcode '{generated_barcode}' for '{product_name}'")

            # Validate barcode format
            elif vals.get('barcode'):
                barcode = vals['barcode'].strip()
                if barcode and not re.match(r'^[A-Za-z0-9\-\s\._]+$', barcode):
                    raise UserError(_("Invalid barcode format: %s") % barcode)
                vals['barcode'] = barcode

        return super().create(vals_list)

    def write(self, vals):
        """Update barcode when name changes"""
        if 'name' in vals and 'barcode' not in vals:
            for product in self:
                new_barcode = self._generate_barcode_from_name(vals['name'])
                if product.barcode != new_barcode:
                    vals['barcode'] = new_barcode
                    _logger.info(f"Updated barcode for '{product.name}': {product.barcode} -> {new_barcode}")
                break
        return super().write(vals)

    @api.constrains('barcode')
    def _check_barcode_validity(self):
        """Validate Code128 barcode format"""
        for product in self:
            if product.barcode and not re.match(r'^[A-Za-z0-9\-\s\._]+$', product.barcode):
                raise UserError(_("Invalid barcode format for '%s': %s") % (product.name, product.barcode))

    @api.model
    def update_existing_barcodes(self):
        """Bulk update all products to use name-based barcodes"""
        products = self.search([])
        updated = skipped = 0

        _logger.info(f"Starting barcode update for {len(products)} products")

        for product in products:
            if not product.name:
                skipped += 1
                continue

            expected_barcode = self._generate_barcode_from_name(product.name)
            if product.barcode != expected_barcode:
                try:
                    product.with_context(skip_barcode_uniqueness=True).write({'barcode': expected_barcode})
                    updated += 1
                except Exception as e:
                    _logger.error(f"Failed to update barcode for {product.name}: {e}")
                    skipped += 1

        _logger.info(f"Barcode update complete: {updated} updated, {skipped} skipped")
        return {'updated': updated, 'skipped': skipped}

    # Barcode uniqueness constraint
    _sql_constraints = [
        ('barcode_uniq', 'unique(barcode)', 'Barcode must be unique!')
    ]