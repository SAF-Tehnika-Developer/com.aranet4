'use strict'

const Homey = require('homey')

const DATA_SERVICE_UUIDS = Homey.manifest.aranet4homey_data.data_service_uuid
const DATA_CHARACTERISTIC_UUID = Homey.manifest.aranet4homey_data.data_characteristic_uuid
const MAX_RETRIES = Homey.manifest.aranet4homey_data.max_retries

/*/ 
  expects least significant bytes first: [1,0,0] => 1
/*/
const intFromBytes = (...bytes) => bytes.reduce((result, byte, i) => result + byte * 2 ** (i * 8), 0)

class Aranet4Homey extends Homey.App {
  onInit() {
    console.log('\nAranet4Homey is running................................')
  }

  async discoverDevices(requiredNamePart) {
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
          DATA_SERVICE_UUIDS.some(uuid => advertisement.serviceUuids.includes(uuid)) &&
          advertisement.localName.includes(requiredNamePart),
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
        device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long
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
            this.manifest.aranet4homey_data.timeout.long / 1000 +
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

        const manufacturerData = advertisement.manufacturerData
        const sensorValues = {}

        let interval, passed

        if (manufacturerData.length < 24) {
          return this.homey.notifications.createNotification({ excerpt: 'bad data received' })
        }

        if (name.includes('Aranet4')) {
          const offset = -5
          sensorValues.measure_co2 = manufacturerData.readUInt16LE(15 + offset)
          sensorValues.measure_temperature = manufacturerData.readUInt16LE(17 + offset) / 20
          sensorValues.measure_pressure = manufacturerData.readUInt16LE(19 + offset) / 10
          sensorValues.measure_humidity = manufacturerData.readUInt8(21 + offset)
          sensorValues.measure_battery = manufacturerData.readUInt8(22 + offset)
          interval = manufacturerData.readUInt16LE(24 + offset)
          passed = manufacturerData.readUInt16LE(26 + offset)
        } else {
          // [2, 7, 2, 33, 23, 4, 1, 0]
          // [2, 7, 2,  1, 23, 4, 1, 0]
          // Aranet☢ 03A76 [2, 1, 6, 9, 255, 2, 7, 2, 33, 23, 4, 1, 0, 3, 2, 224, 252, 16, 9, 65, 114, 97, 110, 101, 116, 226, 152, 162, 32, 48, 51, 65, 55, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          // Aranet☢ 03A76 [2, 1, 6, 9, 255, 2, 7, 2,  1, 23, 4, 1, 0, 3, 2, 224, 252, 16, 9, 65, 114, 97, 110, 101, 116, 226, 152, 162, 32, 48, 51, 65, 55, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          // Aranet☢ 03A76 [2, 1, 6, 9, 255, 2, 7, 2, 1, 23, 4, 1, 0, 3, 2, 224, 252, 16, 9, 65, 114, 97, 110, 101, 116, 226, 152, 162, 32, 48, 51, 65, 55, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

          if (name.includes('\u2622')) {
            // ☢
            const bytes = [...manufacturerData]

            sensorValues.measure_radiation_total_dose = manufacturerData.readUInt32LE(8) * 1e-6 //intFromBytes(...bytes.slice(8, 12)) * 1e-6 // 0.016
            const seconds = manufacturerData.readUInt32LE(12) //intFromBytes(...bytes.slice(12, 16)) //594000
            const days = Math.floor(seconds / (3600 * 24))
            const hours = Math.floor((seconds % (3600 * 24)) / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            const time = days === 0 ? `${hours}h ${minutes}m` : `${days}d ${hours}h`

            sensorValues.measure_radiation_dose_rate = intFromBytes(...bytes.slice(16, 19)) * 1e-3 // 0.13

            device.setCapabilityOptions('measure_radiation_total_dose', { title: { en: time } })
          } else {
            sensorValues.measure_temperature = manufacturerData.readUInt16LE(12) / 20
            sensorValues.measure_humidity = manufacturerData.readUInt16LE(16) / 10
          }
          sensorValues.measure_battery = manufacturerData.readUInt8(19)
          interval = manufacturerData.readUInt16LE(21)
          passed = manufacturerData.readUInt16LE(23)
        }

        sensorValues.alarm_battery = sensorValues.battery < this.manifest.aranet4homey_data.battery_alarm_trigger

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
          sensorValues.measure_battery >= this.manifest.aranet4homey_data.battery_alarm_trigger + 10
        ) {
          device.alarm_battery_triggered = false
        }

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

module.exports = Aranet4Homey
