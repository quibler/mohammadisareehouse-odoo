# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    brand_qr_enabled = fields.Boolean(
        string="Enable Brand QR Code",
        default=False,
        help="Show QR code linking to brand pages on receipts"
    )

    brand_qr_image = fields.Binary(
        string="QR Code Image",
        help="Upload your QR code image (PNG, JPG, etc.)"
    )

    brand_qr_label = fields.Char(
        string="QR Code Label",
        default="Visit our website",
        help="Text to display below the QR code"
    )

    def _get_pos_ui_pos_config(self, params):
        """Add brand QR settings to the POS config data sent to the frontend"""
        config_data = super()._get_pos_ui_pos_config(params)

        # Convert binary image to base64 data URL if present
        qr_image_url = False
        if self.brand_qr_image:
            import base64
            try:
                # In Odoo, binary fields are stored as base64 strings
                # We need to ensure it's properly formatted as a data URL
                if isinstance(self.brand_qr_image, bytes):
                    # If it's bytes, encode to base64
                    base64_data = base64.b64encode(self.brand_qr_image).decode('utf-8')
                else:
                    # If it's already a string (base64), use it directly
                    base64_data = self.brand_qr_image

                qr_image_url = f"data:image/png;base64,{base64_data}"
            except Exception as e:
                # Log error and continue without QR image
                import logging
                _logger = logging.getLogger(__name__)
                _logger.error(f"Error processing brand QR image: {e}")
                qr_image_url = False

        config_data.update({
            'brand_qr_enabled': self.brand_qr_enabled or False,
            'brand_qr_image': qr_image_url,
            'brand_qr_label': self.brand_qr_label or 'Visit our website',
        })
        return config_data


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_brand_qr_enabled = fields.Boolean(
        related='pos_config_id.brand_qr_enabled',
        readonly=False,
        string="Enable Brand QR Code"
    )
    pos_brand_qr_image = fields.Binary(
        related='pos_config_id.brand_qr_image',
        readonly=False,
        string="QR Code Image"
    )
    pos_brand_qr_label = fields.Char(
        related='pos_config_id.brand_qr_label',
        readonly=False,
        string="QR Code Label"
    )