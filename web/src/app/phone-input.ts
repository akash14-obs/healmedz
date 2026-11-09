import { Component, input, model } from '@angular/core';

/** Indian mobile field: a fixed +91 and exactly 10 digits. The value is the 10 digits alone. */
@Component({
  selector: 'app-phone-input',
  template: `
    <label>{{ label() }}
      <span class="phone-field">
        <span class="phone-prefix">+91</span>
        <input type="tel" inputmode="numeric" autocomplete="tel-national" required placeholder="10-digit mobile"
          [name]="name()" [value]="value()" (input)="onInput($event)" />
      </span>
    </label>
  `,
})
export class PhoneInput {
  readonly label = input('Mobile number');
  readonly name = input('phone');
  readonly value = model('');

  protected onInput(event: Event) {
    const field = event.target as HTMLInputElement;
    let digits = field.value.replace(/\D/g, '');
    // A pasted number can arrive with its country code or a leading zero.
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    field.value = digits;
    this.value.set(digits);
  }
}
