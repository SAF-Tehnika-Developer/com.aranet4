'use strict'

const Homey = require('homey')

const DATA_SERVICE_UUIDS = Homey.manifest.aranet4homey_data.data_service_uuid
const DATA_CHARACTERISTIC_UUID = Homey.manifest.aranet4homey_data.data_characteristic_uuid
const MAX_RETRIES = Homey.manifest.aranet4homey_data.max_retries

class Aranet4Driver extends Homey.Driver {
  onInit() {
    console.log('Aranet4Driver initialised..............................')
    console.log('Starting Aranet4 synchronization sequence..............')
    setTimeout(() => this.synchroniseSensorData(), 1000)
  }

  onPairListDevices() {
    console.log('\nDiscovering new devices................................')

    return this.discoverDevices()
      .then(devices => {
        console.log('Devices found: ', devices)
        return devices
      })
      .catch(error => {
        console.log('Cannot get devices: ' + error)
        return []
      })
  }

  synchroniseSensorData() {
    if (this.syncInProgress == null) {
      this.syncInProgress = true
      this.syncTimeout = null

      try {
        let devices = this.getDevices()
        this.allUnavailable = true

        if (devices.length > 0) {
          console.log('\n-----------------Init all device update----------------')
          this.updateDevices(devices)
            .then(() => {
              devices.forEach(device => {
                if (device.getAvailable() || device.retry != 0) {
                  this.allUnavailable = false
                }
              })
              this.setNewTimeout()

              console.log('-------------------All devices updated-----------------')
            })
            .catch(error => {
              this.setNewTimeout()
              console.log('Error updating devices: ', error)
            })
        } else {
          console.log('No devices to synchronize, Aranet4 synchronization sequence stopped')
        }
      } catch (error) {
        this.setNewTimeout()
        console.log('Error updating devices: ', error)
      } finally {
        this.syncInProgress = setTimeout(() => {
          this.syncInProgress = null
        }, 3000)
      }
    } else {
      console.log('\nSimultaneous synchroniseSensorData() call prevented\n')
    }
  }

  setNewTimeout() {
    let checkInterval = this.homey.app.manifest.aranet4homey_data.timeout.regular
    if (this.allUnavailable) {
      checkInterval = this.homey.app.manifest.aranet4homey_data.timeout.long
      console.log('No connection to any Aranet4 devices, checkup timeout set to ' + checkInterval / 1000 + ' s')
    }
    this.syncTimeout = setTimeout(this.synchroniseSensorData.bind(this), checkInterval)
  }

  async discoverDevices() {
    let devices = []
    this.discoveringDevices = true
    for (let i = 0; i < 5; i++) {
      const advertisements = await this.homey.ble.discover([], 1000)
      devices.push(advertisements)
    }
    this.discoveringDevices = false
    devices = devices
      .flat()
      .filter(
        advertisement =>
          advertisement.localName !== undefined &&
          DATA_SERVICE_UUIDS.some(uuid => advertisement.serviceUuids.includes(uuid)),
      )
      .map(function (advertisement) {
        return {
          name: advertisement.localName,
          data: {
            id: advertisement.id,
            uuid: advertisement.uuid,
            address: advertisement.uuid,
            name: advertisement.localName,
          },
        }
      })
    return [...new Map(devices.map(item => [item['name'], item])).values()]
  }

  async findDevice(device) {
    return await this.homey.ble.find(device.getData().uuid).then(function (advertisement) {
      if (typeof advertisement === 'undefined') {
        return null
      } else {
        return advertisement
      }
    })
  }

  async checkup(device) {
    let name = device.getData().name
    let timenow = new Date().getTime()
    console.log('\nAttempting to refresh ' + name)

    let disconnectPeripheral = async () => {
      console.log('disconnectPeripheral not registered yet')
    }

    if (timenow >= device.nextcheckuptime) {
      if (device.retry >= MAX_RETRIES) {
        if (device.getSettings().connection == true && device.lost_conn == false) {
          let text = this.homey.__('notifications.connection.lost', {
            device: name,
          })
          this.homey.notifications.createNotification({ excerpt: text }).catch(error => {
            console.log('Lost connection notification not registered:' + error)
          })
        }
        device.lost_conn = true
        device.nextcheckuptime = timenow + this.homey.app.manifest.aranet4homey_data.timeout.long
        device.retry = 0
        await device.setUnavailable(
          this.homey.__('notifications.app.no_connection', {
            device: name,
          }),
        )
        console.log(
          'Connection failed after ' +
            MAX_RETRIES +
            ' retries, next checkup set after ' +
            this.homey.app.manifest.aranet4homey_data.timeout.long / 1000 +
            ' s',
        )
        return device
      }
      if (this.discoveringDevices) {
        console.log('Start 10s BLE module discovery checkup timeout')
        await new Promise(resolve => setTimeout(resolve, 10000))
        console.log('End BLE module discovery checkup timeout')
      }
      try {
        console.log(
          '---------Refresh sensor data for ' +
            name +
            '---------' +
            ' (attempt ' +
            (device.retry + 1) +
            '/' +
            MAX_RETRIES +
            ')',
        )

        let advertisement = await this.findDevice(device)
        if (!advertisement) {
          device.retry += 1
          console.log('Missing advertisement: ' + name)
          return device
        }

        console.log('Attemtping to connect: ' + name)
        device.peripheral = await advertisement.connect()

        disconnectPeripheral = async () => {
          try {
            console.log('Attempting to disconnect ' + name + ' peripheral')
            if (device.peripheral.isConnected) {
              return await device.peripheral.disconnect()
            }
          } catch (err) {
            console.log('Error disconnecting peripheral for ' + name + ': ' + err)
          }
        }

        let services = await device.peripheral.discoverServices()

        let service = await services.find(service => DATA_SERVICE_UUIDS.includes(service.uuid))
        if (!service) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.homey.app.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            this.homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Missing data service: ' + name)
          await disconnectPeripheral()
          return device
        }
        let characteristics = await service.discoverCharacteristics()

        console.log('Getting sensor data: ' + name)
        let data = await characteristics.find(characteristic => characteristic.uuid === DATA_CHARACTERISTIC_UUID)
        if (!data) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.homey.app.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            this.homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Missing data characteristic')
          await disconnectPeripheral()
          return device
        }
        let sensorData = await data.read()
        console.log('Sensor data: ', sensorData)

        if (!sensorData.length) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.homey.app.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            this.homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Refresh canceled for ' + name + ': Homey integration is disabled or calibration in progress')
          await disconnectPeripheral()
          return device
        }

        let sensorValues = {
          measure_co2: sensorData.readUInt16LE(0),
          measure_temperature: sensorData.readUInt16LE(2) / 20,
          measure_pressure: sensorData.readUInt16LE(4) / 10,
          measure_humidity: sensorData.readUInt8(6),
          measure_battery: sensorData.readUInt8(7),
          alarm_battery: sensorData.readUInt8(7) < this.homey.app.manifest.aranet4homey_data.battery_alarm_trigger,
        }

        if (sensorValues.alarm_battery == true && device.alarm_battery_triggered == false) {
          device.alarm_battery_triggered = true
          let text = this.homey.__('notifications.app.low_battery', {
            device: name,
          })
          this.homey.notifications.createNotification({ excerpt: text }).catch(error => {
            console.log('Low battery notification not registered:' + error)
          })
        } else if (
          sensorValues.alarm_battery == false &&
          device.alarm_battery_triggered == true &&
          sensorValues.measure_battery >= this.homey.app.manifest.aranet4homey_data.battery_alarm_trigger + 10
        ) {
          device.alarm_battery_triggered = false
        }

        let interval = sensorData.readUInt16LE(9)
        let passed = sensorData.readUInt16LE(11)
        if (interval > passed) {
          let remaining = 10 + interval - passed
          device.nextcheckuptime = new Date().getTime() + remaining * 1000
          console.log('Remaining time to refresh ' + name + ': ' + remaining + 's')
        }

        for (const characteristic of device.getCapabilities()) {
          if (sensorValues.hasOwnProperty(characteristic)) {
            await device.setCapabilityValue(characteristic, sensorValues[characteristic])
          }
        }
        console.log('Updated sensor data: \n', sensorValues)

        await disconnectPeripheral()
        console.log('Disconnected ' + name + ' peripheral')

        if (device.lost_conn == true) {
          device.lost_conn = false
          if (device.getSettings().connection == true) {
            let text = this.homey.__('notifications.connection.secured', {
              device: name,
            })
            this.homey.notifications.createNotification({ excerpt: text }).catch(error => {
              console.log('Restored connection notification not registered:' + error)
            })
          }
        }

        device.retry = 0
        await device.setAvailable()
        console.log('Refresh completed for: ' + name)

        return device
      } catch (err) {
        device.retry += 1
        await disconnectPeripheral()
        console.log('Refresh error: ' + err)
        console.log('Start 10s BLE module error recovery timeout')
        await new Promise(resolve => setTimeout(resolve, 10000))
        console.log('End BLE module error recovery timeout')
        return device
      }
    } else {
      console.log('---Refresh sensor data for ' + name + ' (postphoned)--')
      console.log('Remaining time to next refresh ' + name + ': ' + ~~((device.nextcheckuptime - timenow) / 1000) + 's')
      return device
    }
  }

  async updateDevice(device) {
    return await this.checkup(device)
  }

  async updateDevices(devices) {
    return await devices.reduce((promise, device) => {
      return promise
        .then(() => {
          return this.updateDevice(device)
        })
        .catch(error => {
          console.log(error)
        })
    }, Promise.resolve())
  }
}

module.exports = Aranet4Driver
