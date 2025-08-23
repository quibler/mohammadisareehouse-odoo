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
        templates = super().create(vals_list)

        for template in templates:
            if len(template.product_variant_ids) == 1:
                variant = template.product_variant_ids[0]
                if not variant.barcode and template.name:
                    generated_barcode = variant._generate_barcode(template.name)
                    variant.barcode = generated_barcode
                    _logger.info(f"Generated barcode '{generated_barcode}' for '{template.name}'")

        return templates


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _generate_ean13_checksum(self, code):
        """Calculate EAN-13 check digit"""
        odd_sum = sum(int(code[i]) for i in range(0, 12, 2))
        even_sum = sum(int(code[i]) for i in range(1, 12, 2))
        total = odd_sum + (even_sum * 3)
        return str((10 - (total % 10)) % 10)

    def _generate_ean13(self, name):
        """Generate EAN-13 barcode from product name"""
        # Kuwait internal prefix + hash of name
        name_hash = str(abs(hash(name.upper().strip())))[-8:]
        code = "2990" + name_hash
        return code + self._generate_ean13_checksum(code)

    def _generate_legacy_barcode(self, name):
        """Generate legacy format barcode (for existing products)"""
        if not name:
            return f"PROD_{str(int(time.time()))[-6:]}"

        cleaned = re.sub(r'[^A-Za-z0-9\s\-\._]', '', name.strip())
        cleaned = cleaned.replace(' ', '_').upper()[:25]
        return cleaned or f"PROD_{self.id or str(int(time.time()))[-6:]}"

    def _is_legacy_barcode(self, barcode):
        """Check if barcode is in legacy format"""
        return bool(barcode and (
                barcode.startswith('PROD_') or
                ('_' in barcode and not barcode.isdigit())
        ))

    def _ensure_unique_barcode(self, barcode):
        """Make barcode unique if needed"""
        if not barcode:
            return barcode

        counter = 1
        original_barcode = barcode
        current_barcode = barcode

        while True:
            # Check if barcode exists (excluding current record)
            domain = [('barcode', '=', current_barcode)]
            if hasattr(self, 'id') and self.id:
                domain.append(('id', '!=', self.id))

            if not self.search(domain, limit=1):
                return current_barcode

            # Make unique
            if len(original_barcode) == 13 and original_barcode.isdigit():
                # EAN-13: increment middle digits and recalculate checksum
                try:
                    base = original_barcode[:4] + str(int(original_barcode[4:11]) + counter)[-7:].zfill(7)
                    current_barcode = base + self._generate_ean13_checksum(base)
                except:
                    # Fallback if EAN-13 manipulation fails
                    current_barcode = f"PROD_{int(time.time())}{counter}"
            else:
                # Legacy: add suffix
                suffix = f"_{counter}"
                max_length = 25 - len(suffix)
                current_barcode = original_barcode[:max_length] + suffix

            counter += 1

            # Safety check to prevent infinite loop
            if counter > 9999:
                current_barcode = f"PROD_{int(time.time())}{counter}"
                break

        return current_barcode

    def _generate_barcode(self, name, force_ean13=False):
        """Main barcode generation - EAN-13 for new/cleared, legacy for existing"""
        if force_ean13 or not (hasattr(self, 'barcode') and self._is_legacy_barcode(self.barcode)):
            barcode = self._generate_ean13(name)
        else:
            barcode = self._generate_legacy_barcode(name)

        return self._ensure_unique_barcode(barcode)

    @api.model_create_multi
    def create(self, vals_list):
        """Auto-generate EAN-13 barcodes for new products"""
        for vals in vals_list:
            if not vals.get('barcode') and vals.get('name'):
                vals['barcode'] = self._generate_barcode(vals['name'])

        return super().create(vals_list)

    def write(self, vals):
        """Generate new barcode when cleared, update when name changes"""
        # Generate barcode before write if cleared
        if 'barcode' in vals and not vals['barcode'] and self.name:
            vals['barcode'] = self._generate_barcode(self.name, force_ean13=True)

        # Update barcode if name changed and barcode was auto-generated
        elif 'name' in vals and 'barcode' not in vals and self.barcode:
            if self._is_legacy_barcode(self.barcode) or self.barcode.startswith('PROD_'):
                new_barcode = self._generate_barcode(vals['name'])
                if self.barcode != new_barcode:
                    vals['barcode'] = new_barcode

        return super().write(vals)

    @api.constrains('barcode')
    def _check_barcode_validity(self):
        """Validate barcode format and ensure uniqueness"""
        for product in self:
            if not product.barcode:
                continue

            # Format validation
            if not (
                    re.match(r'^[A-Za-z0-9\-\s\._]+, product.barcode) or  # Legacy
                                 (len(product.barcode) == 13 and product.barcode.isdigit())  # EAN-13
                             ):
                raise UserError(_("Invalid barcode format for '%s': %s") % (product.name, product.barcode))

            # Uniqueness validation
            duplicates = self.search([
                ('barcode', '=', product.barcode),
                ('id', '!=', product.id)
            ])
            if duplicates:
                raise UserError(_("Barcode '%s' is already used by another product: %s") %
                                (product.barcode, ', '.join(duplicates.mapped('name'))))

    # Enhanced barcode uniqueness constraint
    _sql_constraints = [
        ('barcode_uniq', 'unique(barcode)', 'Barcode must be unique across all products!')
    ]