<template lang="pug">
    .bottom-margin(v-if="possibleValues !== undefined")
        FloatLabel(variant="on")
            Select(
                v-model="discreteValue"
                :options="possibleValues"
                optionLabel="name"
                @change="selectChange"
                class="w-full"
                scrollHeight="400px"
                :appendTo="overlayContainer ?? 'body'"
                size="small"
            )
                template(#value="slotProps")
                    span(
                        v-if="slotProps.value"
                        :class="{ emphasise: slotProps.value.emphasise }"
                    ) {{ slotProps.value.name }}
                    span(v-else) {{ slotProps.placeholder }}
                template(#option="slotProps")
                    .flex.items-center
                        span(:class="{ emphasise: slotProps.option.emphasise }") {{ slotProps.option.name }}
            label {{ name }}
    .bottom-margin(v-else-if="scalarType")
        FloatLabel(variant="on")
            InputText(
                :modelValue="scalarValue"
                :invalid="isInvalid"
                @value-change="validateInput"
                v-on:focusout="inputTextFocusOut"
                v-on:keypress="inputTextKeyPress"
                class="w-full"
                size="small"
            )
            label {{ nameUnits }}
            Message(
                v-if="isInvalid"
                severity="error"
                size="small"
                variant="simple") {{ errorMessage }}

    .bottom-margin(v-else)
        FloatLabel(variant="on")
            InputText(
                :modelValue="textValue"
                @value-change="inputTextChange"
                class="w-full"
                size="small"
            )
            label {{ name }}
</template>

<script setup lang="ts">
import * as vue from 'vue'
import { logging } from '#root/utils/logging'
import { useThemeCssVariables } from '#root/utils/themeCssVariables'
import { OVERLAY_CONTAINER_KEY } from '#root/utils/overlays'

useThemeCssVariables('floatlabel')
useThemeCssVariables('inputtext')
useThemeCssVariables('select')

// Show the dropdown within the editor's DOM, not in `document.body`
const overlayContainer = vue.inject(OVERLAY_CONTAINER_KEY, vue.ref(null))

import { ucum } from '@atomic-ehr/ucum'

import type * as locApi from '../../libopencor/locUIJsonApi'

type ValueType = number|string|locApi.IUiJsonDiscreteInputPossibleValue

const inputValue = defineModel<ValueType>({ required: true })

const emits = defineEmits(['change'])

const props = defineProps<{
    name: string
    value: ValueType
    maximumValue?: number
    minimumValue?: number
    itemId: string
    units?: string
    numeric?: boolean
    possibleValues?: locApi.IUiJsonDiscreteInputPossibleValue[]
    stepValue?: number
}>()

const nameUnits = vue.computed(() => props.units ? `${props.name} (${props.units})` : props.name)

const errorMessage = vue.ref('')
const isInvalid = vue.computed(() => errorMessage.value.trim() !== '')

const scalarType = !!props.numeric

let oldValue = (props.possibleValues === undefined)
             ? inputValue.value
             : (inputValue.value as locApi.IUiJsonDiscreteInputPossibleValue).value

const discreteValue = vue.computed<locApi.IUiJsonDiscreteInputPossibleValue>({
    get() {
        const value = (inputValue.value as locApi.IUiJsonDiscreteInputPossibleValue)
        oldValue = value.value
        logging.trace('discreteValue', { itemId: props.itemId, oldValue })
        return value
    },
    set(_: ValueType) {
    }
})

const scalarValue = vue.computed<string>(() => {
    oldValue = String(inputValue.value).trim()
    if (scalarType) {
        const valueFields = oldValue.split(/\s+/)
        const valueString = valueFields[0] as string
        let valueUnits = valueFields[1]
        if (valueUnits && props.units && ucum.convert(1, valueUnits, props.units) === 1) {
            valueUnits = undefined
        }
        oldValue = valueUnits ? `${valueString} ${valueUnits}` : valueString
    }
    logging.trace('scalarValue', { itemId: props.itemId, oldValue })
    return oldValue
})

const textValue = vue.computed<string>(() => {
    oldValue = String(inputValue.value).trim()
    logging.trace('textValue', { itemId: props.itemId, oldValue })
    return oldValue
})

// Some methods to handle a scalar value using an input text and a slider.

function emitChange(newValue: string) {
    void vue.nextTick().then(() => {
        if (scalarType && props.possibleValues === undefined) {
            inputValue.value = newValue
        }
        emits('change', props.itemId, oldValue, newValue)
        oldValue = newValue
    })
}

interface ISelectChangeEvent {
    value: {
        name: string
        value: number
    }
}

function selectChange(event: ISelectChangeEvent) {
    if (event.value.value !== oldValue) {
        emitChange(String(event.value.value))
    }
}

function inputTextChange(newValue: string) {
    errorMessage.value = ''
    if (scalarType) {
        // Input has already been validated
        const valueFields = newValue.trim().split(/\s+/)
        let valueString = valueFields[0] as string
        if (valueString === '') {
            valueString = String(props.minimumValue)
        }
        const valueNumber = Number(valueString)
        if (props.minimumValue !== undefined && valueNumber < props.minimumValue) {
            valueString = String(props.minimumValue)
        }
        if (props.maximumValue !== undefined && valueNumber > props.maximumValue) {
            valueString = String(props.maximumValue)
        }
        // want
        let valueUnits = valueFields[1]
        if (valueUnits && props.units && ucum.convert(1, valueUnits, props.units) === 1) {
            valueUnits = undefined
        }
        newValue = valueUnits ? `${valueString} ${valueUnits}` : valueString
    }
    logging.trace('inputTextChange', { itemId: props.itemId, oldValue, newValue })
    if (newValue !== oldValue) {
        emitChange(newValue)
    }
}

function validateInput(newValue: string) {
    errorMessage.value = ''
    if (scalarType) {
        const valueFields = newValue.trim().split(/\s+/)
        let valueString = valueFields[0] as string
        if (valueString === '') {
            valueString = String(props.minimumValue)
        }
        if (isNaN(Number(valueString))) {
            errorMessage.value = 'Invalid number'
        } else if (valueFields.length > 1) {
            if (!props.units || valueFields.length > 2) {
                errorMessage.value = 'Invalid units specification'
            } else {
                const valueUnits = valueFields[1] as string
                if (!ucum.validate(valueUnits).valid) {
                    errorMessage.value = 'Unknown units'
                } else if (!ucum.isConvertible(valueUnits, props.units)) {
                    errorMessage.value = 'Incompatible units'
                }
            }
        }
    }
    if (errorMessage.value === '') {
        inputTextChange(newValue)
    }
}

function inputTextFocusOut(event: Event) {
    // Input has already been validated
    if (errorMessage.value === '') {
        inputTextChange((event.target as HTMLInputElement).value)
    }
}

function inputTextKeyPress(event: KeyboardEvent) {
    // Input has already been validated
    if (errorMessage.value === '' && event.key === 'Enter') {
        inputTextChange((event.target as HTMLInputElement).value)
    }
}
</script>

<style scoped>
    .bottom-margin {
        margin-bottom: 20px;
    }
    .emphasise {
        font-style: italic;
    }
</style>
