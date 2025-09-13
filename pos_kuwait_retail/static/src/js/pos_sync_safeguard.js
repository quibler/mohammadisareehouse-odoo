/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(ClosePosPopup.prototype, {
    setup() {
        super.setup();
        this.syncRetries = 0;
        this.maxRetries = 3;
        this.isSyncing = false;
        this.syncStatusMessage = '';
    },

    async closeSession() {
        // Block UI and show sync status
        this.isSyncing = true;
        this.syncRetries = 0;
        this.syncStatusMessage = _t("Checking sync status...");
        
        // Try up to 3 times to sync orders
        while (this.syncRetries < this.maxRetries) {
            this.syncRetries++;
            this.syncStatusMessage = _t("Syncing orders... (Attempt %s of %s)", this.syncRetries, this.maxRetries);
            
            try {
                // Use standard POS sync method
                const syncSuccess = await this.pos.push_orders_with_closing_popup();
                
                if (syncSuccess) {
                    // Sync successful, proceed with normal closure
                    this.isSyncing = false;
                    return super.closeSession();
                }
                
                // Sync failed, will retry if under max retries
                if (this.syncRetries < this.maxRetries) {
                    // Wait 2 seconds before retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error(`Sync attempt ${this.syncRetries} failed:`, error);
                
                // If this was the last retry, break and show fallback
                if (this.syncRetries >= this.maxRetries) {
                    break;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // All sync attempts failed - export session data and allow close
        this.syncStatusMessage = _t("Exporting session data...");
        await this.exportSessionData();
        this.isSyncing = false;
        
        // Proceed with normal closure after data export
        return super.closeSession();
    },

    async exportSessionData() {
        try {
            // Export session data for manual recovery
            const sessionData = {
                timestamp: new Date().toISOString(),
                session_id: this.pos.session.id,
                session_name: this.pos.session.name,
                pending_orders: this.pos.getPendingOrder(),
                message: "Session closed with unsynced orders - manual recovery required"
            };

            const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pos_session_backup_${this.pos.session.name}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error("Failed to export session data:", error);
        }
    },

    canConfirm() {
        // Disable confirm button during sync
        if (this.isSyncing) {
            return false;
        }
        return super.canConfirm();
    },

    canCancel() {
        // Disable cancel during sync
        if (this.isSyncing) {
            return false;
        }
        return super.canCancel();
    },
});