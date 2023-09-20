'use strict'

const Homey = require('homey')

class Aranet2Device extends Homey.Device {
  onAdded() {
    console.log('Added device: ' + this.getData().name)
    let added = new Date()
    this.setSettings({
      added:
        ('0' + added.getDate()).slice(-2) +
        '-' +
        ('0' + (added.getMonth() + 1)).slice(-2) +
        '-' +
        added.getFullYear() +
        ' ' +
        ('0' + added.getHours()).slice(-2) +
        ':' +
        ('0' + added.getMinutes()).slice(-2),
    })
    let driver = this.homey.drivers.getDriver('aranet2')
    driver.synchroniseSensorData()
    console.log('Restarting Aranet2 synchronization sequence............')
  }

  onDeleted() {
    console.log('Removed device: ' + this.getData().name)
  }

  onInit() {
    this.setUnavailable(this.homey.__('notifications.device.init', { device: this.getData().name }))
    this.alarm_battery_triggered = false
    this.lost_conn = false
    this.retry = 0
    this.nextcheckuptime = new Date().getTime()
    let restarted = new Date()
    this.setSettings({
      name: this.getData().name,
      uuid: this.getData().uuid,
      restarted:
        ('0' + restarted.getDate()).slice(-2) +
        '-' +
        ('0' + (restarted.getMonth() + 1)).slice(-2) +
        '-' +
        restarted.getFullYear() +
        ' ' +
        ('0' + restarted.getHours()).slice(-2) +
        ':' +
        ('0' + restarted.getMinutes()).slice(-2),
    })
  }

  getAddress() {
    let data = this.getData()
    if (data.uuid) {
      return data.uuid
    }
    if (data.address) {
      return data.address
    }
  }
}

module.exports = Aranet2Device
